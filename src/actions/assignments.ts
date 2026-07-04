"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import type { ActiveHolder } from "@/db/queries";
import { assignments, persons } from "@/db/schema";
import { actorName, requireSession } from "@/lib/auth-helpers";
import { formatName } from "@/lib/format";
import { resolveTenureEnd } from "@/lib/person-schema";

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

/** Server-side "today" as an ISO date — the documented upper bound for "Ende unbekannt". */
const todayIso = (): string => new Date().toISOString().slice(0, 10);

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
  // Either a concrete Bis-Datum or "Ende unbekannt" (endUnknown ⇒ end_date = today).
  endDate: dateField,
  endUnknown: z.boolean().default(false),
});

/**
 * End a currently active tenure by setting its `end_date`; the row becomes history
 * and stops counting towards the table, PDF, distribution rules and mail recipients.
 * With `endUnknown` the end is recorded as unknown (end_date = today upper bound).
 */
export async function endAssignment(raw: z.infer<typeof endSchema>): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = endSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const { assignmentId, endDate, endUnknown } = parsed.data;

  const [row] = await db
    .select({ personId: assignments.personId, startDate: assignments.startDate, endDate: assignments.endDate })
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!row) return { ok: false, message: "Zuordnung nicht gefunden." };
  if (row.endDate != null) return { ok: false, message: "Dieses Amt ist bereits beendet." };

  const resolved = resolveTenureEnd({ startDate: row.startDate, endDate, endUnknown, today: todayIso() });
  if (!resolved.ok) return { ok: false, message: resolved.message };

  // Guard the update against a concurrent savePerson (delete+recreate of active
  // rows): if the row vanished in between, report it instead of silently ending nothing.
  const updated = await db
    .update(assignments)
    .set({ endDate: resolved.endDate, endUnknown: resolved.endUnknown, updatedAt: new Date() })
    .where(and(eq(assignments.id, assignmentId), isNull(assignments.endDate)))
    .returning({ id: assignments.id });
  if (updated.length === 0)
    return { ok: false, message: "Zuordnung wurde zwischenzeitlich geändert. Bitte Seite neu laden." };
  await touchPerson(row.personId, actorName(session));
  refresh();
  return { ok: true };
}

// --- active holders of an (office, group) combination ("Amtsinhaber-Warnung") ---

/**
 * Active holders of a given office+group combination (issue #26). Drives the editor's
 * holder warning; session-guarded, on-demand (the form fetches per combination, no
 * polling). Returns every currently active tenure — the caller filters out the person
 * being edited so it never warns about themselves.
 */
export async function getActiveHolders(officeId: number, groupId: number): Promise<ActiveHolder[]> {
  await requireSession();
  if (!Number.isInteger(officeId) || !Number.isInteger(groupId)) return [];
  const rows = await db
    .select({
      assignmentId: assignments.id,
      personId: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      scoutName: persons.scoutName,
      startDate: assignments.startDate,
    })
    .from(assignments)
    .innerJoin(persons, eq(persons.id, assignments.personId))
    .where(
      and(eq(assignments.officeId, officeId), eq(assignments.groupId, groupId), isNull(assignments.endDate)),
    );
  return rows.map((r) => ({
    assignmentId: r.assignmentId,
    personId: r.personId,
    name: formatName(r),
    startDate: r.startDate,
  }));
}

// --- create a past tenure ("Frühere Ämter" → hinzufügen) ------------------------

const addHistoricalSchema = z.object({
  personId: z.number().int().positive(),
  groupId: z.number().int().positive("Bitte eine Gliederung wählen."),
  officeId: z.number().int().positive().nullish(),
  startDate: dateField,
  // A historical entry is a *finished* tenure, so it always gets an end date: either the
  // Bis-Datum or — with `endUnknown` — today as the documented upper bound. Without it the
  // row would be active and could clash with the current office.
  endDate: dateField,
  endUnknown: z.boolean().default(false),
});

/** Create an ended tenure for retroactive capture (e.g. an office held before the app existed). */
export async function addHistoricalAssignment(
  raw: z.infer<typeof addHistoricalSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = addHistoricalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const { personId, groupId, officeId, startDate, endDate, endUnknown } = parsed.data;

  const resolved = resolveTenureEnd({ startDate, endDate, endUnknown, today: todayIso() });
  if (!resolved.ok) return { ok: false, message: resolved.message };

  await db.insert(assignments).values({
    personId,
    groupId,
    officeId: officeId ?? null,
    startDate,
    endDate: resolved.endDate,
    endUnknown: resolved.endUnknown,
  });
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
  endDate: dateField,
  endUnknown: z.boolean().default(false),
});

/** Edit an ended tenure. Refuses to touch an active row (that belongs to the person form). */
export async function updateHistoricalAssignment(
  raw: z.infer<typeof updateHistoricalSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = updateHistoricalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const { assignmentId, groupId, officeId, startDate, endDate, endUnknown } = parsed.data;

  const resolved = resolveTenureEnd({ startDate, endDate, endUnknown, today: todayIso() });
  if (!resolved.ok) return { ok: false, message: resolved.message };

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
    .set({
      groupId,
      officeId: officeId ?? null,
      startDate,
      endDate: resolved.endDate,
      endUnknown: resolved.endUnknown,
      updatedAt: new Date(),
    })
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
