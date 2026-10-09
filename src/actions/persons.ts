"use server";

import { and, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import { assignments, distributionListMembers, persons } from "@/db/schema";
import {
  deletedMeanwhile,
  getActionSession,
  pgError,
  revalidateApp,
  SESSION_EXPIRED,
  UserFacingError,
  type ActionResult,
} from "@/lib/action-helpers";
import { actorName } from "@/lib/auth-helpers";
import { todayIso } from "@/lib/format";
import { parsePersonInput, resolveTenureEnd, type FieldErrors, type PersonInput } from "@/lib/person-schema";

export type SaveResult =
  | { ok: true; id: number }
  | { ok: false; message: string; errors?: FieldErrors };

const TENURE_CHANGED = "Ein Amt wurde inzwischen geändert. Bitte lade die Seite neu.";

/** A referenced row vanished mid-save: name it by the violated foreign key. */
const FK_MESSAGES: Record<string, string> = {
  assignments_group_id_groups_id_fk: deletedMeanwhile("Eine gewählte Gliederung"),
  assignments_office_id_offices_id_fk: deletedMeanwhile("Ein gewähltes Amt"),
  persons_rank_id_ranks_id_fk: deletedMeanwhile("Der gewählte Stand"),
  distribution_list_members_list_id_distribution_lists_id_fk: deletedMeanwhile("Ein gewählter Verteiler"),
  assignments_person_id_persons_id_fk: deletedMeanwhile("Diese Person"),
  distribution_list_members_person_id_persons_id_fk: deletedMeanwhile("Diese Person"),
};

/**
 * Create or update a person plus its active tenures and manual list memberships in one
 * transaction. Concurrency: the form sends the `updatedAt` it was loaded with; the row is
 * locked (SELECT … FOR UPDATE) and the save refused if someone saved it in between, so
 * two editors never silently merge or overwrite each other's changes.
 */
export async function savePerson(raw: PersonInput): Promise<SaveResult> {
  const session = await getActionSession();
  if (!session) return SESSION_EXPIRED;

  const parsed = parsePersonInput(raw);
  if (!parsed.ok)
    return {
      ok: false,
      errors: parsed.errors,
      message: Object.values(parsed.errors)[0] ?? "Bitte prüfe die markierten Felder.",
    };
  const data = parsed.data;

  const by = actorName(session);
  const today = todayIso();
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

  let id: number;
  try {
    id = await db.transaction(async (tx) => {
      let personId: number;
      if (data.id != null) {
        personId = data.id;
        const [current] = await tx
          .select({ updatedAt: persons.updatedAt, updatedBy: persons.updatedBy })
          .from(persons)
          .where(eq(persons.id, personId))
          .for("update");
        if (!current) throw new UserFacingError(deletedMeanwhile("Diese Person"));
        if (current.updatedAt.toISOString() !== data.updatedAt)
          throw new UserFacingError(
            `Diese Person wurde inzwischen ${current.updatedBy ? `von ${current.updatedBy} ` : ""}geändert. Bitte lade die Seite neu.`,
          );
        await tx.update(persons).set(fields).where(eq(persons.id, personId));
      } else {
        const [row] = await tx.insert(persons).values(fields).returning({ id: persons.id });
        personId = row.id;
      }

      // Holder-warning follow-ups (issue #26): end the active tenures of *other* people
      // the editor chose to close. Runs in THIS transaction and BEFORE we touch this
      // person's own rows, so cancelling the form writes nothing. Each update is guarded
      // (still active, foreign person); a vanished or already-ended target rolls the whole
      // save back with a reload hint.
      for (const ep of data.endPrevious) {
        const [target] = await tx
          .select({ personId: assignments.personId, startDate: assignments.startDate, endDate: assignments.endDate })
          .from(assignments)
          .where(eq(assignments.id, ep.assignmentId))
          .limit(1);
        if (!target || target.endDate != null || target.personId === personId)
          throw new UserFacingError(TENURE_CHANGED);
        const resolved = resolveTenureEnd({
          startDate: target.startDate,
          endDate: ep.endDate,
          endUnknown: ep.endUnknown,
          today,
        });
        if (!resolved.ok) throw new UserFacingError(resolved.message);
        const ended = await tx
          .update(assignments)
          .set({ endDate: resolved.endDate, endUnknown: resolved.endUnknown, updatedAt: new Date() })
          .where(
            and(eq(assignments.id, ep.assignmentId), isNull(assignments.endDate), ne(assignments.personId, personId)),
          )
          .returning({ id: assignments.id });
        if (ended.length === 0) throw new UserFacingError(TENURE_CHANGED);
        // Attribute the change on the former holder too, so their audit line reflects it.
        await tx.update(persons).set({ updatedBy: by, updatedAt: new Date() }).where(eq(persons.id, target.personId));
      }

      // Delete + recreate only the ACTIVE tenures. Ended tenures (end_date set) are the
      // office history and are managed separately (see actions/assignments.ts) — the
      // person form never carries them, so they must survive a normal save.
      if (data.id != null)
        await tx.delete(assignments).where(and(eq(assignments.personId, personId), isNull(assignments.endDate)));
      // Rows with a Bis-Datum or "Ende unbekannt" become finished tenures (history) right
      // away: past offices captured in the form, or an "Amt beenden" buffered until now.
      if (data.assignments.length > 0)
        await tx.insert(assignments).values(
          data.assignments.map((a) => ({
            personId,
            groupId: a.groupId,
            officeId: a.officeId,
            startDate: a.startDate,
            endDate: a.endUnknown ? today : a.endDate,
            endUnknown: a.endUnknown,
          })),
        );

      // Manual list memberships: delete + recreate, same as the active tenures.
      await tx.delete(distributionListMembers).where(eq(distributionListMembers.personId, personId));
      if (data.distributionListIds.length > 0)
        await tx
          .insert(distributionListMembers)
          .values(data.distributionListIds.map((listId) => ({ listId, personId })));
      return personId;
    });
  } catch (err) {
    // Every failure rolled the whole transaction back, so nothing changed.
    if (err instanceof UserFacingError) return { ok: false, message: err.message };
    const pg = pgError(err);
    if (pg?.code === "23505" && pg.constraint === "assignments_active_person_group_office_key")
      // The active-tenure partial unique index: e.g. a concurrent save of the same person.
      return { ok: false, message: "Diese Amt-Gliederungs-Kombination ist bereits aktiv zugeordnet." };
    if (pg?.code === "23503")
      return {
        ok: false,
        message: FK_MESSAGES[pg.constraint ?? ""] ?? deletedMeanwhile("Ein gewählter Eintrag"),
      };
    throw err;
  }

  revalidateApp();
  return { ok: true, id };
}

export async function deletePerson(id: number): Promise<ActionResult> {
  if (!(await getActionSession())) return SESSION_EXPIRED;
  // Assignments and memberships cascade with the person.
  await db.delete(persons).where(eq(persons.id, id));
  revalidateApp();
  return { ok: true };
}
