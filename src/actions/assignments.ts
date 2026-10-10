"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, type Tx } from "@/db";
import { audited } from "@/db/audit";
import { assignments, persons } from "@/db/schema";
import {
  dbFailure,
  deletedMeanwhile,
  firstError,
  lockPerson,
  mutation,
  stamp,
  UserFacingError,
} from "@/lib/action-helpers";
import { todayIso } from "@/lib/format";
import { isValidDate, resolveTenureEnd, rowId } from "@/lib/person-schema";

// Office-history mutations. Active tenures — including ending one ("Beenden" in the
// editor) — are owned by `savePerson` (buffered in the form, written on Speichern).
// These actions only manage rows that are ALREADY history: creating, editing and removing
// past tenures as immediate, standalone writes, so a normal person save never touches them.
// Each one is logged on the person (src/db/audit.ts).

type HistoryResult =
  | {
      ok: true;
      /** The person's new `updatedAt`: the editor's concurrency token from now on. */
      updatedAt: string;
    }
  | { ok: false; message: string };

/**
 * Lock the person, refuse when it changed since the editor loaded it (the same token
 * `savePerson` checks), run `work`, log what it changed and bump the person's
 * `updated_at`/`updated_by`. Returns the new token: the editor keeps it, so a history
 * action never makes another editor's save look like the current state.
 */
async function changePerson(
  tx: Tx,
  personId: number,
  expected: string,
  by: string,
  work: () => Promise<unknown>,
): Promise<string> {
  await lockPerson(tx, personId, expected);
  await audited(tx, personId, by, work);
  const stamped = stamp(by);
  await tx.update(persons).set(stamped).where(eq(persons.id, personId));
  return stamped.updatedAt.toISOString();
}

/** The history row to edit or delete; refuses an active one (that belongs to the person form). */
async function historyRow(tx: Tx, assignmentId: number, activeMessage: string) {
  const [row] = await tx
    .select({ personId: assignments.personId, endDate: assignments.endDate, endUnknown: assignments.endUnknown })
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!row) throw new UserFacingError(deletedMeanwhile("Dieses frühere Amt"));
  if (row.endDate == null) throw new UserFacingError(activeMessage);
  return { ...row, endDate: row.endDate };
}

/**
 * Run a history write in one transaction; `work` returns the person's new `updatedAt`.
 * `missing` answers a reference (group, office or the person) deleted since page load.
 */
async function inHistoryTx(work: (tx: Tx) => Promise<string>, missing: string): Promise<HistoryResult> {
  try {
    return { ok: true, updatedAt: await db.transaction(work) };
  } catch (err) {
    return dbFailure(err, { fk: missing });
  }
}

const MISSING_REFERENCE = "Gliederung oder Amt existiert nicht mehr. Bitte lade die Seite neu.";

const dateField = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v == null || isValidDate(v), "Bitte ein gültiges Datum eingeben.");

/**
 * What both dialogs send. A history entry is a *finished* tenure, so it always gets an
 * end: the Bis-Datum or — with `endUnknown` — today as the documented upper bound.
 */
const tenureFields = {
  /** The person's `updatedAt` as the editor holds it (concurrency token). */
  updatedAt: z.string().max(40),
  groupId: z.number().int().positive("Bitte eine Gliederung wählen."),
  officeId: rowId.nullish(),
  startDate: dateField,
  endDate: dateField,
  endUnknown: z.boolean().default(false),
};

// --- create a past tenure ("Frühere Ämter" → hinzufügen) ------------------------

const addHistoricalSchema = z.object({ personId: rowId, ...tenureFields });

/** Create an ended tenure for retroactive capture (e.g. an office held before the app existed). */
export async function addHistoricalAssignment(raw: z.input<typeof addHistoricalSchema>): Promise<HistoryResult> {
  return mutation(async (by) => {
    const parsed = addHistoricalSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const { personId, updatedAt, groupId, officeId, startDate, endDate, endUnknown } = parsed.data;

    const resolved = resolveTenureEnd({ startDate, endDate, endUnknown, today: todayIso() });
    if (!resolved.ok) return { ok: false, message: resolved.message };

    return inHistoryTx(
      (tx) =>
        changePerson(tx, personId, updatedAt, by, () =>
          tx.insert(assignments).values({
            personId,
            groupId,
            officeId: officeId ?? null,
            startDate,
            endDate: resolved.endDate,
            endUnknown: resolved.endUnknown,
          }),
        ),
      MISSING_REFERENCE,
    );
  });
}

// --- edit a past tenure ---------------------------------------------------------

const updateHistoricalSchema = z.object({ assignmentId: rowId, ...tenureFields });

/** Edit an ended tenure. Refuses to touch an active row (that belongs to the person form). */
export async function updateHistoricalAssignment(
  raw: z.input<typeof updateHistoricalSchema>,
): Promise<HistoryResult> {
  return mutation(async (by) => {
    const parsed = updateHistoricalSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const { assignmentId, updatedAt, groupId, officeId, startDate, endDate, endUnknown } = parsed.data;

    return inHistoryTx(async (tx) => {
      const row = await historyRow(tx, assignmentId, "Ein aktives Amt wird über das Formular bearbeitet, nicht hier.");
      // "Ende unbekannt" documents an upper bound (the recording date). When it stays unknown
      // and still lies after the Von date, keep that bound: recomputing it would move the end
      // forward to today on every edit, weakening "was over by then at the latest".
      const keepBound = endUnknown && endDate == null && row.endUnknown && (startDate == null || startDate <= row.endDate);
      const resolved = keepBound
        ? { ok: true as const, endDate: row.endDate, endUnknown: true }
        : resolveTenureEnd({ startDate, endDate, endUnknown, today: todayIso() });
      if (!resolved.ok) throw new UserFacingError(resolved.message);
      return changePerson(tx, row.personId, updatedAt, by, () =>
        tx
          .update(assignments)
          .set({
            groupId,
            officeId: officeId ?? null,
            startDate,
            endDate: resolved.endDate,
            endUnknown: resolved.endUnknown,
            updatedAt: new Date(),
          })
          .where(eq(assignments.id, assignmentId)),
      );
    }, MISSING_REFERENCE);
  });
}

// --- delete a tenure ("Eintrag löschen") ----------------------------------------

const deleteSchema = z.object({ assignmentId: rowId, updatedAt: tenureFields.updatedAt });

/**
 * Hard-delete a HISTORY row ("Eintrag löschen" in Frühere Ämter). Active rows are
 * managed through the editor buffer + savePerson; refusing them here keeps a crafted
 * request from deleting a current office through the history action.
 */
export async function deleteAssignment(raw: z.input<typeof deleteSchema>): Promise<HistoryResult> {
  return mutation(async (by) => {
    const parsed = deleteSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const { assignmentId, updatedAt } = parsed.data;

    return inHistoryTx(async (tx) => {
      const row = await historyRow(tx, assignmentId, "Aktive Ämter werden über das Formular entfernt oder beendet.");
      return changePerson(tx, row.personId, updatedAt, by, () =>
        tx.delete(assignments).where(eq(assignments.id, assignmentId)),
      );
    }, deletedMeanwhile("Diese Person"));
  });
}
