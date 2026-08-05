"use server";

import { and, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import { assignments, distributionListMembers, persons } from "@/db/schema";
import {
  isForeignKeyViolation,
  isUniqueViolation,
  revalidatePersonPaths,
  todayIso,
} from "@/lib/action-helpers";
import { actorName, requireSession } from "@/lib/auth-helpers";
import {
  cleanPersonInput,
  parsePersonInput,
  resolveTenureEnd,
  validatePersonDates,
  validateTenure,
  type FieldErrors,
  type PersonInput,
} from "@/lib/person-schema";

/**
 * Thrown inside the save transaction to roll everything back with a user-facing German
 * message (e.g. a holder-warning follow-up whose target vanished). Caught in savePerson.
 */
class SaveAbort extends Error {}

export type SaveResult =
  | { ok: true; id: number }
  | { ok: false; errors: FieldErrors; message?: string };

/** Create or update a person plus its assignments (delete + recreate) in one transaction. */
export async function savePerson(raw: PersonInput): Promise<SaveResult> {
  const session = await requireSession();

  const parsed = parsePersonInput(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const data = cleanPersonInput(parsed.data);

  // Re-validate the cleaned payload (empty PLZ/e-mail become null → no false errors).
  const revalidated = parsePersonInput(data);
  if (!revalidated.ok) return { ok: false, errors: revalidated.errors };

  // Validate the person's own life dates (Geburts-/Sterbedatum) — the schema only bounds
  // their length, so a malformed or out-of-order date would otherwise reach the DB.
  const dateError = validatePersonDates(data.birthDate ?? null, data.deathDate ?? null);
  if (dateError) return { ok: false, errors: {}, message: dateError };

  // Validate every tenure; a row with an end date is a finished (past) office.
  for (const a of data.assignments) {
    const err = validateTenure(a.startDate ?? null, a.endDate ?? null);
    if (err) return { ok: false, errors: {}, message: err };
  }

  const by = actorName(session);
  const fields = {
    salutation: data.salutation,
    title: data.title,
    firstName: data.firstName,
    lastName: data.lastName,
    scoutName: data.scoutName,
    birthDate: data.birthDate,
    deathDate: data.deathDate,
    rankId: data.rankId,
    street: data.street,
    addressExtra: data.addressExtra,
    postalCode: data.postalCode,
    city: data.city,
    email: data.email,
    phones: data.phones,
    notes: data.notes,
    doNotPrint: data.doNotPrint,
    updatedBy: by,
    updatedAt: new Date(),
  };

  const today = todayIso();
  let id: number;
  try {
    id = await db.transaction(async (tx) => {
      let personId = data.id;
      if (personId) {
        // Guard against a concurrent delete: an UPDATE that matches no row would
        // otherwise report success (and any FK insert below would blow up as a raw 500).
        const updated = await tx
          .update(persons)
          .set(fields)
          .where(eq(persons.id, personId))
          .returning({ id: persons.id });
        if (updated.length === 0)
          throw new SaveAbort("Diese Anschrift wurde zwischenzeitlich gelöscht. Bitte Seite neu laden.");
      } else {
        const [row] = await tx.insert(persons).values(fields).returning({ id: persons.id });
        personId = row.id;
      }

      // Holder-warning follow-ups (issue #26): end the active tenures of *other* people
      // the editor chose to close. Runs in THIS transaction and BEFORE we touch this
      // person's own rows, so cancelling the form writes nothing. Each update is guarded
      // (still active, foreign person); a vanished or already-ended target rolls the whole
      // save back with a reload hint — same contract as endAssignment.
      for (const ep of data.endPrevious) {
        const [target] = await tx
          .select({
            personId: assignments.personId,
            startDate: assignments.startDate,
            endDate: assignments.endDate,
          })
          .from(assignments)
          .where(eq(assignments.id, ep.assignmentId))
          .limit(1);
        if (!target || target.endDate != null || target.personId === personId)
          throw new SaveAbort("Ein Amt wurde zwischenzeitlich geändert. Bitte Seite neu laden.");
        const resolved = resolveTenureEnd({
          startDate: target.startDate,
          endDate: ep.endDate,
          endUnknown: ep.endUnknown,
          today,
        });
        if (!resolved.ok) throw new SaveAbort(resolved.message);
        const ended = await tx
          .update(assignments)
          .set({ endDate: resolved.endDate, endUnknown: resolved.endUnknown, updatedAt: new Date() })
          .where(
            and(
              eq(assignments.id, ep.assignmentId),
              isNull(assignments.endDate),
              ne(assignments.personId, personId),
            ),
          )
          .returning({ id: assignments.id });
        if (ended.length === 0)
          throw new SaveAbort("Ein Amt wurde zwischenzeitlich geändert. Bitte Seite neu laden.");
        // Attribute the change on the former holder too, so their audit line reflects it.
        await tx
          .update(persons)
          .set({ updatedBy: by, updatedAt: new Date() })
          .where(eq(persons.id, target.personId));
      }

      // Delete + recreate only the ACTIVE tenures. Ended tenures (end_date set) are the
      // office history and are managed separately (see actions/assignments.ts) — the
      // person form never carries them, so they must survive a normal save. (No-op for a
      // freshly inserted person, which has no rows yet.)
      if (data.id) {
        await tx
          .delete(assignments)
          .where(and(eq(assignments.personId, personId), isNull(assignments.endDate)));
      }
      if (data.assignments.length > 0) {
        // Rows with an end date are stored as finished tenures (history) right away —
        // this lets past offices be captured directly when creating a person.
        await tx.insert(assignments).values(
          data.assignments.map((a) => ({
            personId: personId!,
            groupId: a.groupId,
            officeId: a.officeId,
            startDate: a.startDate ?? null,
            endDate: a.endDate ?? null,
          })),
        );
      }

      // Distribution-list memberships: delete + recreate, same as assignments.
      await tx.delete(distributionListMembers).where(eq(distributionListMembers.personId, personId!));
      if (data.distributionListIds.length > 0) {
        await tx.insert(distributionListMembers).values(
          data.distributionListIds.map((listId) => ({ listId, personId: personId! })),
        );
      }
      return personId!;
    });
  } catch (err) {
    // A holder-warning follow-up failed (target vanished / already ended) — the whole
    // transaction rolled back, so nothing changed; surface the German message.
    if (err instanceof SaveAbort) return { ok: false, errors: {}, message: err.message };
    // The active-tenure partial unique index rejected a second active (person, group, office).
    if (isUniqueViolation(err))
      return {
        ok: false,
        errors: {},
        message: "Diese Amt-Gliederungs-Kombination ist bereits aktiv zugeordnet.",
      };
    // A referenced row (the person, a group or office) vanished mid-transaction.
    if (isForeignKeyViolation(err))
      return {
        ok: false,
        errors: {},
        message: "Diese Anschrift wurde zwischenzeitlich gelöscht. Bitte Seite neu laden.",
      };
    throw err;
  }

  revalidatePersonPaths();
  return { ok: true, id };
}

export async function deletePerson(id: number): Promise<{ ok: true }> {
  await requireSession();
  // Memberships cascade with the person, so the list counts change too.
  await db.delete(persons).where(eq(persons.id, id));
  revalidatePersonPaths();
  return { ok: true };
}
