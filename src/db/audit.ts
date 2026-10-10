import { asc, eq } from "drizzle-orm";

import type { Tx } from "@/db";
import {
  assignments,
  auditLog,
  distributionListMembers,
  distributionLists,
  groups,
  offices,
  persons,
  ranks,
} from "@/db/schema";
import { diffSnapshots, listChange, type AuditSnapshot } from "@/lib/audit";

// The change log's write side (src/lib/audit.ts is the pure side). Every person mutation
// logs through these helpers inside its own transaction, so a change and its entry are
// committed — or rolled back — together.

/** A person as the log compares it, or null when it does not exist. */
export async function personSnapshot(tx: Tx, personId: number): Promise<AuditSnapshot | null> {
  const [person] = await tx
    .select({
      salutation: persons.salutation,
      title: persons.title,
      firstName: persons.firstName,
      lastName: persons.lastName,
      scoutName: persons.scoutName,
      rank: ranks.name,
      birthDate: persons.birthDate,
      deathDate: persons.deathDate,
      street: persons.street,
      addressExtra: persons.addressExtra,
      postalCode: persons.postalCode,
      city: persons.city,
      email: persons.email,
      phones: persons.phones,
      notes: persons.notes,
      doNotPrint: persons.doNotPrint,
    })
    .from(persons)
    .leftJoin(ranks, eq(ranks.id, persons.rankId))
    .where(eq(persons.id, personId));
  if (!person) return null;
  const tenures = await tx
    .select({
      id: assignments.id,
      groupId: assignments.groupId,
      officeId: assignments.officeId,
      group: groups.name,
      office: offices.name,
      startDate: assignments.startDate,
      endDate: assignments.endDate,
      endUnknown: assignments.endUnknown,
    })
    .from(assignments)
    .innerJoin(groups, eq(groups.id, assignments.groupId))
    .leftJoin(offices, eq(offices.id, assignments.officeId))
    .where(eq(assignments.personId, personId))
    .orderBy(asc(assignments.id));
  const lists = await tx
    .select({ name: distributionLists.name })
    .from(distributionListMembers)
    .innerJoin(distributionLists, eq(distributionLists.id, distributionListMembers.listId))
    .where(eq(distributionListMembers.personId, personId))
    .orderBy(asc(distributionLists.name));
  return { ...person, tenures, lists: lists.map((l) => l.name) };
}

/**
 * Log what changed on a person since `before` — its snapshot taken before the writes, or
 * null for a person created in this transaction. An update that changed nothing is not
 * logged.
 */
export async function logPersonChange(
  tx: Tx,
  personId: number,
  actor: string,
  before: AuditSnapshot | null,
): Promise<void> {
  const after = await personSnapshot(tx, personId);
  if (!after) return;
  const changes = diffSnapshots(before, after);
  if (before && changes.length === 0) return;
  await tx.insert(auditLog).values({ personId, actor, action: before ? "updated" : "created", changes });
}

/** Log manual memberships of a Verteiler added (or removed): one entry per person. */
export async function logMemberships(
  tx: Tx,
  listId: number,
  personIds: number[],
  actor: string,
  added: boolean,
): Promise<void> {
  const [list] = await tx
    .select({ name: distributionLists.name })
    .from(distributionLists)
    .where(eq(distributionLists.id, listId));
  if (!list) return;
  const changes = [listChange(list.name, added)];
  await tx
    .insert(auditLog)
    .values(personIds.map((personId) => ({ personId, actor, action: "updated" as const, changes })));
}

/**
 * Log a deletion. The person's own entries cascade away with it (privacy), so all that
 * remains is this one: who deleted someone, and when — no name, no id, no values.
 */
export async function logDeletion(tx: Tx, actor: string): Promise<void> {
  await tx.insert(auditLog).values({ personId: null, actor, action: "deleted" });
}
