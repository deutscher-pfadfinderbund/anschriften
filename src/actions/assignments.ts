"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { assignments, persons } from "@/db/schema";
import { actorName, requireSession } from "@/lib/auth-helpers";
import { validateTenure } from "@/lib/person-schema";

// Office-history mutations (issue #22). Active tenures are owned by `savePerson`
// (delete + recreate from the form); these actions manage the *history* — ending a
// current office and creating/editing/removing past ones — as immediate, standalone
// writes so a normal person save never touches historical rows.

export type ActionResult = { ok: true } | { ok: false; message: string };

function firstError(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Ungültige Eingabe.";
}

const dateField = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v && v.length > 0 ? v : null));

/** Bump the owning person's audit fields so the change is attributed and lists refresh. */
async function touchPerson(personId: number, by: string): Promise<void> {
  await db.update(persons).set({ updatedBy: by, updatedAt: new Date() }).where(eq(persons.id, personId));
}

function refresh(): void {
  revalidatePath("/");
  revalidatePath("/verteiler");
}

// --- end an active tenure ("Amt beenden…") --------------------------------------

const endSchema = z.object({
  assignmentId: z.number().int().positive(),
  endDate: z.string().trim().min(1, "Bitte ein Bis-Datum angeben."),
});

/**
 * End a currently active tenure by setting its `end_date`; the row becomes history
 * and stops counting towards the table, PDF, distribution rules and mail recipients.
 */
export async function endAssignment(raw: z.infer<typeof endSchema>): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = endSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const { assignmentId, endDate } = parsed.data;

  const [row] = await db
    .select({ personId: assignments.personId, startDate: assignments.startDate, endDate: assignments.endDate })
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!row) return { ok: false, message: "Zuordnung nicht gefunden." };
  if (row.endDate != null) return { ok: false, message: "Dieses Amt ist bereits beendet." };

  const tenureError = validateTenure(row.startDate, endDate);
  if (tenureError) return { ok: false, message: tenureError };

  // Guard the update against a concurrent savePerson (delete+recreate of active
  // rows): if the row vanished in between, report it instead of silently ending nothing.
  const updated = await db
    .update(assignments)
    .set({ endDate, updatedAt: new Date() })
    .where(and(eq(assignments.id, assignmentId), isNull(assignments.endDate)))
    .returning({ id: assignments.id });
  if (updated.length === 0)
    return { ok: false, message: "Zuordnung wurde zwischenzeitlich geändert. Bitte Seite neu laden." };
  await touchPerson(row.personId, actorName(session));
  refresh();
  return { ok: true };
}

// --- create a past tenure ("Frühere Ämter" → hinzufügen) ------------------------

const addHistoricalSchema = z.object({
  personId: z.number().int().positive(),
  groupId: z.number().int().positive("Bitte eine Gliederung wählen."),
  officeId: z.number().int().positive().nullish(),
  startDate: dateField,
  // A historical entry is a *finished* tenure, so an end date is mandatory — without it
  // the row would be active and could clash with the current office.
  endDate: z.string().trim().min(1, "Bitte ein Bis-Datum angeben."),
});

/** Create an ended tenure for retroactive capture (e.g. an office held before the app existed). */
export async function addHistoricalAssignment(
  raw: z.infer<typeof addHistoricalSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = addHistoricalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const { personId, groupId, officeId, startDate, endDate } = parsed.data;

  const tenureError = validateTenure(startDate, endDate);
  if (tenureError) return { ok: false, message: tenureError };

  await db.insert(assignments).values({ personId, groupId, officeId: officeId ?? null, startDate, endDate });
  await touchPerson(personId, actorName(session));
  refresh();
  return { ok: true };
}

// --- edit a past tenure ---------------------------------------------------------

const updateHistoricalSchema = z.object({
  assignmentId: z.number().int().positive(),
  groupId: z.number().int().positive("Bitte eine Gliederung wählen."),
  officeId: z.number().int().positive().nullish(),
  startDate: dateField,
  endDate: z.string().trim().min(1, "Bitte ein Bis-Datum angeben."),
});

/** Edit an ended tenure. Refuses to touch an active row (that belongs to the person form). */
export async function updateHistoricalAssignment(
  raw: z.infer<typeof updateHistoricalSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = updateHistoricalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const { assignmentId, groupId, officeId, startDate, endDate } = parsed.data;

  const tenureError = validateTenure(startDate, endDate);
  if (tenureError) return { ok: false, message: tenureError };

  const [row] = await db
    .select({ personId: assignments.personId, endDate: assignments.endDate })
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!row) return { ok: false, message: "Zuordnung nicht gefunden." };
  if (row.endDate == null)
    return { ok: false, message: "Ein aktives Amt wird über das Formular bearbeitet, nicht hier." };

  await db
    .update(assignments)
    .set({ groupId, officeId: officeId ?? null, startDate, endDate, updatedAt: new Date() })
    .where(eq(assignments.id, assignmentId));
  await touchPerson(row.personId, actorName(session));
  refresh();
  return { ok: true };
}

// --- delete a tenure ("Eintrag löschen") ----------------------------------------

const deleteSchema = z.object({ assignmentId: z.number().int().positive() });

/**
 * Hard-delete a HISTORY row ("Eintrag löschen" in Frühere Ämter). Active rows are
 * managed through the editor buffer + savePerson; refusing them here keeps a crafted
 * request from deleting a current office through the history action.
 */
export async function deleteAssignment(raw: z.infer<typeof deleteSchema>): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = deleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const [row] = await db
    .select({ personId: assignments.personId, endDate: assignments.endDate })
    .from(assignments)
    .where(eq(assignments.id, parsed.data.assignmentId))
    .limit(1);
  if (!row) return { ok: false, message: "Zuordnung nicht gefunden." };
  if (row.endDate == null)
    return { ok: false, message: "Aktive Ämter werden über das Formular entfernt oder beendet." };

  await db.delete(assignments).where(eq(assignments.id, parsed.data.assignmentId));
  await touchPerson(row.personId, actorName(session));
  refresh();
  return { ok: true };
}
