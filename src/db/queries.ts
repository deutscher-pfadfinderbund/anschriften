import { asc, count, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  assignments,
  distributionListMembers,
  groups,
  offices,
  persons,
  ranks,
} from "@/db/schema";

export type PhoneEntry = { label: string; number: string };

export type PersonAssignment = {
  id: number;
  groupId: number;
  groupName: string;
  section: string;
  officeId: number | null;
  officeName: string | null;
  officeRank: number;
};

export type PersonListRow = {
  id: number;
  salutation: string | null;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  scoutName: string | null;
  rankName: string | null;
  birthDate: string | null;
  deathDate: string | null;
  city: string | null;
  postalCode: string | null;
  email: string | null;
  phones: PhoneEntry[];
  doNotPrint: boolean;
  assignments: PersonAssignment[];
};

export type GroupRow = {
  id: number;
  name: string;
  parentId: number | null;
  section: string;
  kind: string | null;
  sortKey: number;
};

export type OfficeRow = { id: number; name: string; rank: number };
export type RankRow = { id: number; name: string; sortOrder: number };

/** All persons with their assignments (group + office) and rank — one shot for the table. */
export async function listPersons(): Promise<PersonListRow[]> {
  const rows = await db.query.persons.findMany({
    with: {
      rank: true,
      assignments: {
        with: { group: true, office: true },
      },
    },
  });

  return rows.map((p) => ({
    id: p.id,
    salutation: p.salutation,
    title: p.title,
    firstName: p.firstName,
    lastName: p.lastName,
    scoutName: p.scoutName,
    rankName: p.rank?.name ?? null,
    birthDate: p.birthDate,
    deathDate: p.deathDate,
    city: p.city,
    postalCode: p.postalCode,
    email: p.email,
    phones: (p.phones as PhoneEntry[]) ?? [],
    doNotPrint: p.doNotPrint,
    assignments: p.assignments.map((a) => ({
      id: a.id,
      groupId: a.groupId,
      groupName: a.group.name,
      section: a.group.section,
      officeId: a.officeId,
      officeName: a.office?.name ?? null,
      officeRank: a.office?.rank ?? 999,
    })),
  }));
}

export type PersonEditData = {
  id: number;
  salutation: string | null;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  scoutName: string | null;
  birthDate: string | null;
  deathDate: string | null;
  rankId: number | null;
  street: string | null;
  addressExtra: string | null;
  postalCode: string | null;
  city: string | null;
  email: string | null;
  phones: PhoneEntry[];
  notes: string | null;
  doNotPrint: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  assignments: { groupId: number; officeId: number | null }[];
};

/** One person shaped for the editor, or null if not found. */
export async function getPersonForEdit(id: number): Promise<PersonEditData | null> {
  const p = await db.query.persons.findFirst({
    where: eq(persons.id, id),
    with: { assignments: true },
  });
  if (!p) return null;
  return {
    id: p.id,
    salutation: p.salutation,
    title: p.title,
    firstName: p.firstName,
    lastName: p.lastName,
    scoutName: p.scoutName,
    birthDate: p.birthDate,
    deathDate: p.deathDate,
    rankId: p.rankId,
    street: p.street,
    addressExtra: p.addressExtra,
    postalCode: p.postalCode,
    city: p.city,
    email: p.email,
    phones: (p.phones as PhoneEntry[]) ?? [],
    notes: p.notes,
    doNotPrint: p.doNotPrint,
    updatedAt: p.updatedAt ? p.updatedAt.toISOString() : null,
    updatedBy: p.updatedBy,
    assignments: p.assignments.map((a) => ({ groupId: a.groupId, officeId: a.officeId })),
  };
}

export async function listGroups(): Promise<GroupRow[]> {
  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      parentId: groups.parentId,
      section: groups.section,
      kind: groups.kind,
      sortKey: groups.sortKey,
    })
    .from(groups)
    .orderBy(asc(groups.sortKey), asc(groups.name));
  return rows;
}

export async function listOffices(): Promise<OfficeRow[]> {
  return db
    .select({ id: offices.id, name: offices.name, rank: offices.rank })
    .from(offices)
    .orderBy(asc(offices.rank), asc(offices.name));
}

export async function listRanks(): Promise<RankRow[]> {
  return db
    .select({ id: ranks.id, name: ranks.name, sortOrder: ranks.sortOrder })
    .from(ranks)
    .orderBy(asc(ranks.sortOrder), asc(ranks.name));
}

/** assignment + child counts per group, keyed by group id — for the delete guard. */
export async function groupUsage(): Promise<
  Map<number, { assignments: number; children: number }>
> {
  const assignmentCounts = await db
    .select({ groupId: assignments.groupId, n: count() })
    .from(assignments)
    .groupBy(assignments.groupId);
  const childCounts = await db
    .select({ parentId: groups.parentId, n: count() })
    .from(groups)
    .groupBy(groups.parentId);

  const map = new Map<number, { assignments: number; children: number }>();
  for (const r of assignmentCounts) {
    map.set(r.groupId, { assignments: Number(r.n), children: 0 });
  }
  for (const r of childCounts) {
    if (r.parentId == null) continue;
    const e = map.get(r.parentId) ?? { assignments: 0, children: 0 };
    e.children = Number(r.n);
    map.set(r.parentId, e);
  }
  return map;
}

/** assignment count per office id — for the delete guard. */
export async function officeUsage(): Promise<Map<number, number>> {
  const rows = await db
    .select({ officeId: assignments.officeId, n: count() })
    .from(assignments)
    .groupBy(assignments.officeId);
  const map = new Map<number, number>();
  for (const r of rows) if (r.officeId != null) map.set(r.officeId, Number(r.n));
  return map;
}

/** person count per rank id — for the delete guard. */
export async function rankUsage(): Promise<Map<number, number>> {
  const rows = await db
    .select({ rankId: persons.rankId, n: count() })
    .from(persons)
    .groupBy(persons.rankId);
  const map = new Map<number, number>();
  for (const r of rows) if (r.rankId != null) map.set(r.rankId, Number(r.n));
  return map;
}

/** Distribution-list membership counts — placeholder use in M4; kept for parity. */
export async function distributionMemberCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(distributionListMembers);
  return Number(row?.n ?? 0);
}
