import { asc, count, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import {
  assignments,
  distributionListGroupRules,
  distributionListMembers,
  distributionListOfficeRules,
  distributionListRankRules,
  distributionLists,
  groups,
  mailLog,
  offices,
  persons,
  ranks,
} from "@/db/schema";
import {
  computeEffectiveMembership,
  type MemberOrigin,
} from "@/lib/effective-members";
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
  /** Lists this person is an effective member of (manual ∪ office rule) — for the table filter. */
  effectiveListIds: number[];
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
  const [rows, membership] = await Promise.all([
    db.query.persons.findMany({
      with: {
        rank: true,
        // Only active tenures (end_date IS NULL) drive the Ämter badges and the
        // Amt/Gliederung filters; ended offices live in the editor's history section.
        assignments: {
          where: (a, { isNull }) => isNull(a.endDate),
          with: { group: true, office: true },
        },
      },
    }),
    loadEffectiveMembership(),
  ]);

  // Invert listId → members into personId → effective list ids.
  const listIdsByPerson = new Map<number, number[]>();
  for (const [listId, members] of membership) {
    for (const personId of members.keys()) {
      const arr = listIdsByPerson.get(personId);
      if (arr) arr.push(listId);
      else listIdsByPerson.set(personId, [listId]);
    }
  }

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
    effectiveListIds: listIdsByPerson.get(p.id) ?? [],
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
  /** Active tenures (end_date IS NULL) — the editable "Ämter & Gliederung" rows. */
  assignments: {
    id: number;
    groupId: number;
    officeId: number | null;
    startDate: string | null;
  }[];
  /** Ended tenures (end_date set) — rendered read-only-ish in the "Frühere Ämter" section. */
  historicalAssignments: HistoricalAssignment[];
  distributionListIds: number[];
  /**
   * Lists this person belongs to automatically because a rule matches them — via a
   * held office, their Stand or a Gliederung they are active in (living only). Each
   * `reasons` entry is already human-labelled ("Amt: …", "Stand: …", "Gliederung: …").
   * Rendered as a locked, ticked checkbox with an "automatisch enthalten"-hint.
   */
  ruleMemberships: { listId: number; reasons: string[] }[];
};

/** One ended office tenure for the editor's "Frühere Ämter" section. */
export type HistoricalAssignment = {
  id: number;
  groupId: number;
  groupName: string;
  officeId: number | null;
  officeName: string | null;
  startDate: string | null;
  endDate: string | null;
  /** True when the real end is unknown: `endDate` is only the recording-date upper bound. */
  endUnknown: boolean;
};

/**
 * Active holder of a given (office, group) combination — for the "Amtsinhaber-Warnung"
 * in the person editor (issue #26). Lives here (not in the "use server" action module)
 * so both the server action and the client form import it as a plain type.
 */
export type ActiveHolder = {
  assignmentId: number;
  personId: number;
  name: string;
  startDate: string | null;
};

/** One person shaped for the editor, or null if not found. */
export async function getPersonForEdit(id: number): Promise<PersonEditData | null> {
  const [p, ruleRows, rankRuleRows, groupRuleRows] = await Promise.all([
    db.query.persons.findFirst({
      where: eq(persons.id, id),
      with: {
        assignments: { with: { group: true, office: true } },
        distributionListMembers: true,
      },
    }),
    db
      .select({
        listId: distributionListOfficeRules.listId,
        officeId: distributionListOfficeRules.officeId,
        officeName: offices.name,
      })
      .from(distributionListOfficeRules)
      .innerJoin(offices, eq(offices.id, distributionListOfficeRules.officeId)),
    db
      .select({
        listId: distributionListRankRules.listId,
        rankId: distributionListRankRules.rankId,
        rankName: ranks.name,
      })
      .from(distributionListRankRules)
      .innerJoin(ranks, eq(ranks.id, distributionListRankRules.rankId)),
    db
      .select({
        listId: distributionListGroupRules.listId,
        groupId: distributionListGroupRules.groupId,
        groupName: groups.name,
      })
      .from(distributionListGroupRules)
      .innerJoin(groups, eq(groups.id, distributionListGroupRules.groupId)),
  ]);
  if (!p) return null;

  const activeAssignments = p.assignments.filter((a) => a.endDate == null);
  const historicalAssignments: HistoricalAssignment[] = p.assignments
    .filter((a) => a.endDate != null)
    // Newest tenure first; NULL start sorts last within an equal end.
    .sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? "") || (b.startDate ?? "").localeCompare(a.startDate ?? ""))
    .map((a) => ({
      id: a.id,
      groupId: a.groupId,
      groupName: a.group.name,
      officeId: a.officeId,
      officeName: a.office?.name ?? null,
      startDate: a.startDate,
      endDate: a.endDate,
      endUnknown: a.endUnknown,
    }));

  // Which lists this person is auto-included in. Same union/dedupe semantics as
  // everywhere else (incl. the deceased and ended-tenure exclusions) via
  // computeEffectiveMembership, fed with just this person's assignments.
  const membership = computeEffectiveMembership({
    manualMembers: [],
    officeRules: ruleRows.map((r) => ({ listId: r.listId, officeId: r.officeId })),
    rankRules: rankRuleRows.map((r) => ({ listId: r.listId, rankId: r.rankId })),
    groupRules: groupRuleRows.map((r) => ({ listId: r.listId, groupId: r.groupId })),
    officeAssignments: p.assignments
      .filter((a): a is typeof a & { officeId: number } => a.officeId != null)
      .map((a) => ({ personId: p.id, officeId: a.officeId, endDate: a.endDate })),
    groupAssignments: p.assignments.map((a) => ({
      personId: p.id,
      groupId: a.groupId,
      endDate: a.endDate,
    })),
    personRanks: p.rankId != null ? [{ personId: p.id, rankId: p.rankId }] : [],
    deceasedPersonIds: p.deathDate ? [p.id] : [],
  });
  const officeNameById = new Map(ruleRows.map((r) => [r.officeId, r.officeName]));
  const rankNameById = new Map(rankRuleRows.map((r) => [r.rankId, r.rankName]));
  const groupNameById = new Map(groupRuleRows.map((r) => [r.groupId, r.groupName]));
  const ruleMemberships = [...membership.entries()].flatMap(([listId, members]) => {
    const origin = members.get(p.id);
    if (!origin) return [];
    const reasons = [
      ...origin.viaOfficeIds.map((id) => `Amt: ${officeNameById.get(id)!}`),
      ...origin.viaRankIds.map((id) => `Stand: ${rankNameById.get(id)!}`),
      ...origin.viaGroupIds.map((id) => `Gliederung: ${groupNameById.get(id)!}`),
    ];
    if (reasons.length === 0) return [];
    return [{ listId, reasons }];
  });

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
    assignments: activeAssignments.map((a) => ({
      id: a.id,
      groupId: a.groupId,
      officeId: a.officeId,
      startDate: a.startDate,
    })),
    historicalAssignments,
    distributionListIds: p.distributionListMembers.map((m) => m.listId),
    ruleMemberships,
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

// --- distribution lists (M4 + office rules M-issue16) ---

export type ListMemberRow = {
  personId: number;
  firstName: string | null;
  lastName: string | null;
  scoutName: string | null;
  email: string | null;
  /** The member's senior office (lowest office rank across their assignments), or null. */
  mainOffice: string | null;
  /** True if added by hand (has a removable membership); false if only via a rule. */
  manual: boolean;
  /** Offices (rules) through which this person is auto-included, for the "über Amt: …" chip. */
  viaOffices: { id: number; name: string }[];
  /** Stände (rules) through which this person is auto-included, for the "über Stand: …" chip. */
  viaRanks: { id: number; name: string }[];
  /** Gliederungen (rules) through which this person is auto-included, for the "über Gliederung: …" chip. */
  viaGroups: { id: number; name: string }[];
};

export type OfficeRuleRow = { officeId: number; officeName: string };
export type RankRuleRow = { rankId: number; rankName: string };
export type GroupRuleRow = { groupId: number; groupName: string };

export type DistributionListWithMembers = {
  id: number;
  name: string;
  description: string | null;
  officeRules: OfficeRuleRow[];
  rankRules: RankRuleRow[];
  groupRules: GroupRuleRow[];
  members: ListMemberRow[];
};

/** Sort members like the directory: by last name, else scout name. */
function memberSortKey(m: ListMemberRow): string {
  return (m.lastName || m.scoutName || "").toLowerCase();
}

/**
 * Load the raw membership inputs and compute effective membership for every list.
 * Reused by the table filter and the CSV export; the pure union/dedupe logic lives
 * in `@/lib/effective-members`.
 */
async function loadEffectiveMembership(): Promise<Map<number, Map<number, MemberOrigin>>> {
  const [manualMembers, ruleRows, rankRuleRows, groupRuleRows, assignmentRows, personRankRows, deceasedRows] =
    await Promise.all([
      db
        .select({
          listId: distributionListMembers.listId,
          personId: distributionListMembers.personId,
        })
        .from(distributionListMembers),
      db
        .select({
          listId: distributionListOfficeRules.listId,
          officeId: distributionListOfficeRules.officeId,
        })
        .from(distributionListOfficeRules),
      db
        .select({
          listId: distributionListRankRules.listId,
          rankId: distributionListRankRules.rankId,
        })
        .from(distributionListRankRules),
      db
        .select({
          listId: distributionListGroupRules.listId,
          groupId: distributionListGroupRules.groupId,
        })
        .from(distributionListGroupRules),
      // All assignments (with or without office): office rules use the office half,
      // group rules use the group half. Ended tenures are filtered in the pure logic.
      db
        .select({
          personId: assignments.personId,
          groupId: assignments.groupId,
          officeId: assignments.officeId,
          endDate: assignments.endDate,
        })
        .from(assignments),
      db
        .select({ personId: persons.id, rankId: persons.rankId })
        .from(persons)
        .where(isNotNull(persons.rankId)),
      db.select({ id: persons.id }).from(persons).where(isNotNull(persons.deathDate)),
    ]);

  return computeEffectiveMembership({
    manualMembers,
    officeRules: ruleRows,
    rankRules: rankRuleRows,
    groupRules: groupRuleRows,
    // Pass end_date through; computeEffectiveMembership drops ended tenures so only
    // current office holders / active group members are rule-based members (issue #22).
    officeAssignments: assignmentRows
      .filter((a) => a.officeId != null)
      .map((a) => ({ personId: a.personId, officeId: a.officeId!, endDate: a.endDate })),
    groupAssignments: assignmentRows.map((a) => ({
      personId: a.personId,
      groupId: a.groupId,
      endDate: a.endDate,
    })),
    personRanks: personRankRows.map((r) => ({ personId: r.personId, rankId: r.rankId! })),
    deceasedPersonIds: deceasedRows.map((r) => r.id),
  });
}

/** Every distribution list with its office/rank/group rules and effective members — one shot for /verteiler. */
export async function listDistributionLists(): Promise<DistributionListWithMembers[]> {
  const [lists, ruleRows, rankRuleRows, groupRuleRows, personRows, manualMembers] = await Promise.all([
    db
      .select({
        id: distributionLists.id,
        name: distributionLists.name,
        description: distributionLists.description,
      })
      .from(distributionLists)
      .orderBy(asc(distributionLists.name)),
    db
      .select({
        listId: distributionListOfficeRules.listId,
        officeId: distributionListOfficeRules.officeId,
        officeName: offices.name,
        officeRank: offices.rank,
      })
      .from(distributionListOfficeRules)
      .innerJoin(offices, eq(offices.id, distributionListOfficeRules.officeId)),
    db
      .select({
        listId: distributionListRankRules.listId,
        rankId: distributionListRankRules.rankId,
        rankName: ranks.name,
        rankSort: ranks.sortOrder,
      })
      .from(distributionListRankRules)
      .innerJoin(ranks, eq(ranks.id, distributionListRankRules.rankId)),
    db
      .select({
        listId: distributionListGroupRules.listId,
        groupId: distributionListGroupRules.groupId,
        groupName: groups.name,
        groupSort: groups.sortKey,
      })
      .from(distributionListGroupRules)
      .innerJoin(groups, eq(groups.id, distributionListGroupRules.groupId)),
    db.query.persons.findMany({ with: { assignments: { with: { office: true } } } }),
    db
      .select({
        listId: distributionListMembers.listId,
        personId: distributionListMembers.personId,
      })
      .from(distributionListMembers),
  ]);

  const personById = new Map(personRows.map((p) => [p.id, p]));
  const officeNameById = new Map(ruleRows.map((r) => [r.officeId, r.officeName]));
  const rankNameById = new Map(rankRuleRows.map((r) => [r.rankId, r.rankName]));
  const groupNameById = new Map(groupRuleRows.map((r) => [r.groupId, r.groupName]));

  const officeAssignments: { personId: number; officeId: number; endDate: string | null }[] = [];
  const groupAssignments: { personId: number; groupId: number; endDate: string | null }[] = [];
  const personRanks: { personId: number; rankId: number }[] = [];
  const deceasedPersonIds: number[] = [];
  for (const p of personRows) {
    if (p.deathDate) deceasedPersonIds.push(p.id);
    if (p.rankId != null) personRanks.push({ personId: p.id, rankId: p.rankId });
    for (const a of p.assignments) {
      groupAssignments.push({ personId: p.id, groupId: a.groupId, endDate: a.endDate });
      if (a.officeId != null)
        officeAssignments.push({ personId: p.id, officeId: a.officeId, endDate: a.endDate });
    }
  }

  const membership = computeEffectiveMembership({
    manualMembers,
    officeRules: ruleRows.map((r) => ({ listId: r.listId, officeId: r.officeId })),
    rankRules: rankRuleRows.map((r) => ({ listId: r.listId, rankId: r.rankId })),
    groupRules: groupRuleRows.map((r) => ({ listId: r.listId, groupId: r.groupId })),
    officeAssignments,
    groupAssignments,
    personRanks,
    deceasedPersonIds,
  });

  // Office rules per list, ordered by office rank then name (PDF-style office ordering).
  const officeRulesByList = new Map<number, OfficeRuleRow[]>();
  for (const r of [...ruleRows].sort(
    (a, b) => a.officeRank - b.officeRank || a.officeName.localeCompare(b.officeName, "de"),
  )) {
    const arr = officeRulesByList.get(r.listId) ?? [];
    arr.push({ officeId: r.officeId, officeName: r.officeName });
    officeRulesByList.set(r.listId, arr);
  }
  // Rank rules per list, ordered by the Stand's sort order then name.
  const rankRulesByList = new Map<number, RankRuleRow[]>();
  for (const r of [...rankRuleRows].sort(
    (a, b) => a.rankSort - b.rankSort || a.rankName.localeCompare(b.rankName, "de"),
  )) {
    const arr = rankRulesByList.get(r.listId) ?? [];
    arr.push({ rankId: r.rankId, rankName: r.rankName });
    rankRulesByList.set(r.listId, arr);
  }
  // Group rules per list, ordered by the group's sort key then name.
  const groupRulesByList = new Map<number, GroupRuleRow[]>();
  for (const r of [...groupRuleRows].sort(
    (a, b) => a.groupSort - b.groupSort || a.groupName.localeCompare(b.groupName, "de"),
  )) {
    const arr = groupRulesByList.get(r.listId) ?? [];
    arr.push({ groupId: r.groupId, groupName: r.groupName });
    groupRulesByList.set(r.listId, arr);
  }

  return lists.map((dl) => {
    const memberMap = membership.get(dl.id) ?? new Map<number, MemberOrigin>();
    const members: ListMemberRow[] = [...memberMap.entries()].map(([personId, origin]) => {
      const p = personById.get(personId)!;
      // The member's senior office = lowest-ranked *active* office (ended tenures
      // must not surface as someone's current main office).
      const withOffice = p.assignments
        .filter((a) => a.office && a.endDate == null)
        .sort((a, b) => (a.office!.rank ?? 999) - (b.office!.rank ?? 999));
      const viaOffices = origin.viaOfficeIds
        .map((id) => ({ id, name: officeNameById.get(id) ?? "" }))
        .sort((a, b) => a.name.localeCompare(b.name, "de"));
      const viaRanks = origin.viaRankIds
        .map((id) => ({ id, name: rankNameById.get(id) ?? "" }))
        .sort((a, b) => a.name.localeCompare(b.name, "de"));
      const viaGroups = origin.viaGroupIds
        .map((id) => ({ id, name: groupNameById.get(id) ?? "" }))
        .sort((a, b) => a.name.localeCompare(b.name, "de"));
      return {
        personId,
        firstName: p.firstName,
        lastName: p.lastName,
        scoutName: p.scoutName,
        email: p.email,
        mainOffice: withOffice[0]?.office?.name ?? null,
        manual: origin.manual,
        viaOffices,
        viaRanks,
        viaGroups,
      };
    });
    members.sort((a, b) => memberSortKey(a).localeCompare(memberSortKey(b), "de"));
    return {
      id: dl.id,
      name: dl.name,
      description: dl.description,
      officeRules: officeRulesByList.get(dl.id) ?? [],
      rankRules: rankRulesByList.get(dl.id) ?? [],
      groupRules: groupRulesByList.get(dl.id) ?? [],
      members,
    };
  });
}

export type OfficeListRule = { listId: number; listName: string };

/**
 * Which distribution lists each office is an automatic member of (read-only display
 * on the Ämter page). Keyed by office id.
 */
export async function officeListRules(): Promise<Map<number, OfficeListRule[]>> {
  const rows = await db
    .select({
      officeId: distributionListOfficeRules.officeId,
      listId: distributionListOfficeRules.listId,
      listName: distributionLists.name,
    })
    .from(distributionListOfficeRules)
    .innerJoin(distributionLists, eq(distributionLists.id, distributionListOfficeRules.listId))
    .orderBy(asc(distributionLists.name));
  const map = new Map<number, OfficeListRule[]>();
  for (const r of rows) {
    const arr = map.get(r.officeId) ?? [];
    arr.push({ listId: r.listId, listName: r.listName });
    map.set(r.officeId, arr);
  }
  return map;
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

/** CSV export rows for a whole distribution list (effective members), ordered like the directory. */
export async function personsForCsvByList(listId: number): Promise<CsvPerson[]> {
  const membership = await loadEffectiveMembership();
  const members = membership.get(listId);
  if (!members || members.size === 0) return [];
  // Reuse the by-ids query so effective (manual ∪ rule, deduped) members are exported.
  return personsForCsvByIds([...members.keys()]);
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

// --- mail module (issue #19) ---

/**
 * Effective-member person ids for a list: manual members ∪ living holders of a
 * rule office, deduplicated. Same set the Verteiler detail and CSV export show —
 * reuses `loadEffectiveMembership` so the mail recipients cannot drift from the UI.
 */
export async function effectiveMemberIds(listId: number): Promise<number[]> {
  const membership = await loadEffectiveMembership();
  const members = membership.get(listId);
  return members ? [...members.keys()] : [];
}

/**
 * Raw (nullable, unfiltered) e-mails for a set of person ids — the input to
 * `normalizeRecipients`. Deceased/do-not-print are NOT filtered here: for a
 * hand-picked selection the caller sends to exactly whom they chose.
 */
export async function personEmailsByIds(ids: number[]): Promise<(string | null)[]> {
  if (ids.length === 0) return [];
  const rows = await db.select({ email: persons.email }).from(persons).where(inArray(persons.id, ids));
  return rows.map((r) => r.email);
}

export type MailLogEntry = {
  id: number;
  listId: number | null;
  sentAt: string;
  sentBy: string;
  subject: string;
  recipientCount: number;
  status: "sent" | "failed";
  error: string | null;
};

/**
 * List-scoped mail log, newest first, for the "Zuletzt versendet" card. Only
 * entries still tied to a list (table-selection sends have list_id NULL and no
 * home in the per-list view). The Verteiler manager slices this per list.
 */
export async function mailLogForLists(limit = 200): Promise<MailLogEntry[]> {
  const rows = await db
    .select({
      id: mailLog.id,
      listId: mailLog.listId,
      sentAt: mailLog.sentAt,
      sentBy: mailLog.sentBy,
      subject: mailLog.subject,
      recipientCount: mailLog.recipientCount,
      status: mailLog.status,
      error: mailLog.error,
    })
    .from(mailLog)
    .where(isNotNull(mailLog.listId))
    .orderBy(desc(mailLog.sentAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, sentAt: r.sentAt.toISOString() }));
}
