"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { assignments, persons } from "@/db/schema";
import {
  firstError,
  getActionSession,
  isForeignKeyViolation,
  revalidateApp,
  SESSION_EXPIRED,
  type ActionResult,
} from "@/lib/action-helpers";
import { actorName } from "@/lib/auth-helpers";
import { todayIso } from "@/lib/format";
import { resolveTenureEnd } from "@/lib/person-schema";

// Office-history mutations (issue #22). Active tenures — including ending one ("Beenden"
// in the editor) — are owned by `savePerson` (buffered in the form, written on Speichern).
// These actions only manage rows that are ALREADY history: creating, editing and removing
// past tenures as immediate, standalone writes, so a normal person save never touches them.

const dateField = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v && v.length > 0 ? v : null));

/** Bump the owning person's audit fields so the change is attributed and lists refresh. */
async function touchPerson(personId: number, by: string): Promise<void> {
  await db.update(persons).set({ updatedBy: by, updatedAt: new Date() }).where(eq(persons.id, personId));
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
  const session = await getActionSession();
  if (!session) return SESSION_EXPIRED;
  const parsed = addHistoricalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const { personId, groupId, officeId, startDate, endDate, endUnknown } = parsed.data;

  const resolved = resolveTenureEnd({ startDate, endDate, endUnknown, today: todayIso() });
  if (!resolved.ok) return { ok: false, message: resolved.message };

  try {
    await db.insert(assignments).values({
      personId,
      groupId,
      officeId: officeId ?? null,
      startDate,
      endDate: resolved.endDate,
      endUnknown: resolved.endUnknown,
    });
  } catch (err) {
    // Race: the person, group or office was deleted between page load and this call.
    if (isForeignKeyViolation(err))
      return { ok: false, message: "Person, Gliederung oder Amt existiert nicht mehr. Bitte lade die Seite neu." };
    throw err;
  }
  await touchPerson(personId, actorName(session));
  revalidateApp();
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
  const session = await getActionSession();
  if (!session) return SESSION_EXPIRED;
  const parsed = updateHistoricalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const { assignmentId, groupId, officeId, startDate, endDate, endUnknown } = parsed.data;

  const [row] = await db
    .select({
      personId: assignments.personId,
      endDate: assignments.endDate,
      endUnknown: assignments.endUnknown,
    })
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!row) return { ok: false, message: "Zuordnung nicht gefunden." };
  if (row.endDate == null)
    return { ok: false, message: "Ein aktives Amt wird über das Formular bearbeitet, nicht hier." };

  // "Ende unbekannt" documents an upper bound (the recording date). If it was already
  // unknown and the user does not supply a concrete Bis-Datum, keep the recorded bound —
  // recomputing it would silently move the end forward to today on every edit, weakening
  // the documented "was over by then at the latest". Only recompute when a date is given
  // or the unknown flag is being set anew.
  let resolvedEndDate: string;
  let resolvedEndUnknown: boolean;
  if (endUnknown && endDate == null && row.endUnknown) {
    resolvedEndDate = row.endDate;
    resolvedEndUnknown = true;
  } else {
    const resolved = resolveTenureEnd({ startDate, endDate, endUnknown, today: todayIso() });
    if (!resolved.ok) return { ok: false, message: resolved.message };
    resolvedEndDate = resolved.endDate;
    resolvedEndUnknown = resolved.endUnknown;
  }

  try {
    await db
      .update(assignments)
      .set({
        groupId,
        officeId: officeId ?? null,
        startDate,
        endDate: resolvedEndDate,
        endUnknown: resolvedEndUnknown,
        updatedAt: new Date(),
      })
      .where(eq(assignments.id, assignmentId));
  } catch (err) {
    // Race: the group or office was deleted between page load and this call.
    if (isForeignKeyViolation(err))
      return { ok: false, message: "Gliederung oder Amt existiert nicht mehr. Bitte lade die Seite neu." };
    throw err;
  }
  await touchPerson(row.personId, actorName(session));
  revalidateApp();
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
  const session = await getActionSession();
  if (!session) return SESSION_EXPIRED;
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
  revalidateApp();
  return { ok: true };
}
