import { asc, count, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  assignments,
  distributionListMembers,
  distributionLists,
  groups,
  offices,
  persons,
  ranks,
} from "@/db/schema";
import type { CsvPerson } from "@/lib/export";

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
  distributionListIds: number[];
};

/** One person shaped for the editor, or null if not found. */
export async function getPersonForEdit(id: number): Promise<PersonEditData | null> {
  const p = await db.query.persons.findFirst({
    where: eq(persons.id, id),
    with: { assignments: true, distributionListMembers: true },
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
    distributionListIds: p.distributionListMembers.map((m) => m.listId),
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

// --- distribution lists (M4) ---

export type ListMemberRow = {
  personId: number;
  firstName: string | null;
  lastName: string | null;
  scoutName: string | null;
  email: string | null;
  /** The member's senior office (lowest office rank across their assignments), or null. */
  mainOffice: string | null;
};

export type DistributionListWithMembers = {
  id: number;
  name: string;
  description: string | null;
  members: ListMemberRow[];
};

/** Sort members like the directory: by last name, else scout name. */
function memberSortKey(m: ListMemberRow): string {
  return (m.lastName || m.scoutName || "").toLowerCase();
}

/** Every distribution list with its members (incl. senior office + e-mail) — one shot for /verteiler. */
export async function listDistributionLists(): Promise<DistributionListWithMembers[]> {
  const rows = await db.query.distributionLists.findMany({
    orderBy: (dl, { asc }) => [asc(dl.name)],
    with: {
      members: {
        with: {
          person: { with: { assignments: { with: { office: true } } } },
        },
      },
    },
  });

  return rows.map((dl) => {
    const members = dl.members.map((m) => {
      const withOffice = m.person.assignments
        .filter((a) => a.office)
        .sort((a, b) => (a.office!.rank ?? 999) - (b.office!.rank ?? 999));
      return {
        personId: m.person.id,
        firstName: m.person.firstName,
        lastName: m.person.lastName,
        scoutName: m.person.scoutName,
        email: m.person.email,
        mainOffice: withOffice[0]?.office?.name ?? null,
      };
    });
    members.sort((a, b) => memberSortKey(a).localeCompare(memberSortKey(b), "de"));
    return { id: dl.id, name: dl.name, description: dl.description, members };
  });
}

export type DistributionListSummary = {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
};

/** Lightweight list of all distribution lists with member counts (editor + table dialog). */
export async function listDistributionListSummaries(): Promise<DistributionListSummary[]> {
  const rows = await db
    .select({
      id: distributionLists.id,
      name: distributionLists.name,
      description: distributionLists.description,
      memberCount: count(distributionListMembers.personId),
    })
    .from(distributionLists)
    .leftJoin(distributionListMembers, eq(distributionListMembers.listId, distributionLists.id))
    .groupBy(distributionLists.id)
    .orderBy(asc(distributionLists.name));
  return rows.map((r) => ({ ...r, memberCount: Number(r.memberCount) }));
}

export type PersonOption = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  scoutName: string | null;
  email: string | null;
};

/** Minimal person list for the "add members" combobox. */
export async function listPersonOptions(): Promise<PersonOption[]> {
  return db
    .select({
      id: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      scoutName: persons.scoutName,
      email: persons.email,
    })
    .from(persons)
    .orderBy(asc(persons.lastName), asc(persons.firstName), asc(persons.scoutName));
}

/** Name of a single distribution list (for the CSV download filename), or null. */
export async function getListName(id: number): Promise<string | null> {
  const [row] = await db
    .select({ name: distributionLists.name })
    .from(distributionLists)
    .where(eq(distributionLists.id, id))
    .limit(1);
  return row?.name ?? null;
}

const csvColumns = {
  salutation: persons.salutation,
  title: persons.title,
  firstName: persons.firstName,
  lastName: persons.lastName,
  scoutName: persons.scoutName,
  street: persons.street,
  addressExtra: persons.addressExtra,
  postalCode: persons.postalCode,
  city: persons.city,
  email: persons.email,
};

/** CSV export rows for a whole distribution list, ordered like the directory. */
export async function personsForCsvByList(listId: number): Promise<CsvPerson[]> {
  return db
    .select(csvColumns)
    .from(distributionListMembers)
    .innerJoin(persons, eq(persons.id, distributionListMembers.personId))
    .where(eq(distributionListMembers.listId, listId))
    .orderBy(asc(persons.lastName), asc(persons.firstName), asc(persons.scoutName));
}

/** CSV export rows for an explicit selection of person ids. */
export async function personsForCsvByIds(ids: number[]): Promise<CsvPerson[]> {
  if (ids.length === 0) return [];
  return db
    .select(csvColumns)
    .from(persons)
    .where(inArray(persons.id, ids))
    .orderBy(asc(persons.lastName), asc(persons.firstName), asc(persons.scoutName));
}
