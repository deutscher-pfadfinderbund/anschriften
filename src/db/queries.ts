import { and, asc, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { listsUsingRuleTarget, loadRules, type ListRef, type LoadedRule } from "@/db/list-rules";
import {
  assignments,
  distributionListMembers,
  distributionLists,
  groups,
  mailLog,
  offices,
  persons,
  ranks,
} from "@/db/schema";
import { computeEffectiveMembership, type MemberOrigin } from "@/lib/effective-members";
import type { CsvPerson } from "@/lib/export";
import { formatFullName } from "@/lib/format";
import { byName, sortByDirectoryName } from "@/lib/name-order";
import { RULE_KINDS, type RuleKind, type RuleRef } from "@/lib/rule-kinds";
import type { Section } from "@/lib/sections";

export type { ListRef } from "@/db/list-rules";

// Read side of the app. Every page loads through these functions; mutations live in
// src/actions/*. Sorting by name happens in TS with German collation: the DB cluster's
// C collation would put umlauts after Z.

// --- effective Verteiler membership (manual ∪ rules) ---------------------------------

/**
 * Rules and rule refs in display order: by kind (Amt, Stand, Gliederung), then the
 * target's own order (office rank, Stand order, Gliederung sort key), then name.
 */
function byRuleOrder(a: Omit<LoadedRule, "listId">, b: Omit<LoadedRule, "listId">): number {
  return (
    RULE_KINDS.indexOf(a.kind) - RULE_KINDS.indexOf(b.kind) ||
    a.sort - b.sort ||
    byName(a, b)
  );
}

/** Resolver from a member's `via` (kind + id) to named refs, in display order. */
function viaResolver(rules: LoadedRule[]): (via: MemberOrigin["via"]) => RuleRef[] {
  const byKey = new Map(rules.map((r) => [`${r.kind}:${r.targetId}`, r]));
  return (via) =>
    via
      .map((v) => byKey.get(`${v.kind}:${v.id}`)!)
      .sort(byRuleOrder)
      .map((r) => ({ kind: r.kind, id: r.targetId, name: r.name }));
}

/**
 * THE loader for effective membership: reads every input once and computes membership
 * for all lists (~600 persons — trivial). Used by the directory filter, the Verteiler
 * page, the CSV export and the mail recipients, so all of them agree. Also returns the
 * resolved rules for naming `via` refs.
 */
async function loadEffectiveMembership(): Promise<{
  membership: Map<number, Map<number, MemberOrigin>>;
  rules: LoadedRule[];
}> {
  const [manualMembers, rules, activeAssignments, people] = await Promise.all([
    db
      .select({ listId: distributionListMembers.listId, personId: distributionListMembers.personId })
      .from(distributionListMembers),
    loadRules(),
    // Only active tenures can match a rule; ended ones (history) never do.
    db
      .select({
        personId: assignments.personId,
        groupId: assignments.groupId,
        officeId: assignments.officeId,
        endDate: assignments.endDate,
      })
      .from(assignments)
      .where(isNull(assignments.endDate)),
    db.select({ id: persons.id, rankId: persons.rankId, deathDate: persons.deathDate }).from(persons),
  ]);
  const membership = computeEffectiveMembership({
    manualMembers,
    rules,
    assignments: activeAssignments,
    persons: people,
  });
  return { membership, rules };
}

/** Effective-member person ids of one list (manual ∪ rules, living only). */
export async function effectiveMemberIds(listId: number): Promise<number[]> {
  const { membership } = await loadEffectiveMembership();
  return [...(membership.get(listId)?.keys() ?? [])];
}

// --- directory ("/") ------------------------------------------------------------------

type PhoneEntry = { label: string; number: string };

/** An active assignment as the directory shows it (Ämter badges, Gliederung filter). */
type PersonAssignment = {
  id: number;
  groupId: number;
  groupName: string;
  officeId: number | null;
  officeName: string | null;
};

/** One directory row — only what the table renders, filters and searches. */
export type PersonListRow = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  scoutName: string | null;
  rankName: string | null;
  birthDate: string | null;
  deathDate: string | null;
  /** Searched, not shown. */
  street: string | null;
  city: string | null;
  email: string | null;
  phones: PhoneEntry[];
  doNotPrint: boolean;
  assignments: PersonAssignment[];
  /** Lists this person is an effective member of (manual ∪ rules) — for the table filter. */
  effectiveListIds: number[];
};

/**
 * All persons with their active assignments and rank — one shot for the table, in
 * directory order (like the Verteiler members).
 */
export async function listPersons(): Promise<PersonListRow[]> {
  const [rows, { membership }] = await Promise.all([
    db.query.persons.findMany({
      columns: {
        id: true,
        firstName: true,
        lastName: true,
        scoutName: true,
        birthDate: true,
        deathDate: true,
        street: true,
        city: true,
        email: true,
        phones: true,
        doNotPrint: true,
      },
      with: {
        rank: { columns: { name: true } },
        // Only active tenures (end_date IS NULL) drive the Ämter badges and the
        // Amt/Gliederung filters; ended offices live in the editor's history section.
        assignments: {
          columns: { id: true, groupId: true, officeId: true },
          where: (a, { isNull }) => isNull(a.endDate),
          with: { group: { columns: { name: true } }, office: { columns: { name: true } } },
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

  return sortByDirectoryName(
    rows.map(({ rank, assignments: tenures, ...p }) => ({
      ...p,
      rankName: rank?.name ?? null,
      assignments: tenures.map(({ group, office, ...a }) => ({
        ...a,
        groupName: group.name,
        officeName: office?.name ?? null,
      })),
      effectiveListIds: listIdsByPerson.get(p.id) ?? [],
    })),
  );
}

// --- person editor --------------------------------------------------------------------

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
  /** ISO timestamp of the last change — sent back on save for the concurrency check. */
  updatedAt: string;
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
  /** Lists this person was added to by hand (the editable checkboxes). */
  distributionListIds: number[];
  /**
   * Lists this person belongs to automatically because a rule matches them — via a held
   * office, their Stand or a Gliederung they are active in (living only). Rendered as a
   * locked, ticked checkbox naming the rules.
   */
  ruleMemberships: { listId: number; via: RuleRef[] }[];
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

/** One person shaped for the editor, or null if not found. */
export async function getPersonForEdit(id: number): Promise<PersonEditData | null> {
  const [p, rules] = await Promise.all([
    db.query.persons.findFirst({
      where: eq(persons.id, id),
      with: {
        assignments: { with: { group: true, office: true } },
        distributionListMembers: true,
      },
    }),
    loadRules(),
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

  // Membership of this one person: the same computation as `loadEffectiveMembership`,
  // fed with only their own rows.
  const membership = computeEffectiveMembership({
    manualMembers: p.distributionListMembers,
    rules,
    assignments: p.assignments,
    persons: [p],
  });
  const viaRefs = viaResolver(rules);
  const ruleMemberships = [...membership].flatMap(([listId, members]) => {
    const origin = members.get(p.id);
    return origin && origin.via.length > 0 ? [{ listId, via: viaRefs(origin.via) }] : [];
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
    phones: p.phones,
    notes: p.notes,
    doNotPrint: p.doNotPrint,
    updatedAt: p.updatedAt.toISOString(),
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

/** Active holder of an office in a Gliederung — for the editor's "Amtsinhaber-Warnung" (issue #26). */
export type ActiveHolder = {
  assignmentId: number;
  personId: number;
  /** "Vorname Nachname" — the warning uses it in running text. */
  name: string;
  startDate: string | null;
};

export type ActiveOfficeHolder = ActiveHolder & { officeId: number; groupId: number };

/**
 * Every active office tenure with its holder's name — preloaded by the person pages so
 * the holder warning is a plain lookup. savePerson re-checks each "end previous tenure"
 * order inside its transaction, so a stale preload can never end the wrong tenure.
 */
export async function listActiveOfficeHolders(): Promise<ActiveOfficeHolder[]> {
  const rows = await db
    .select({
      assignmentId: assignments.id,
      officeId: assignments.officeId,
      groupId: assignments.groupId,
      startDate: assignments.startDate,
      personId: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      scoutName: persons.scoutName,
    })
    .from(assignments)
    .innerJoin(persons, eq(persons.id, assignments.personId))
    .where(and(isNull(assignments.endDate), isNotNull(assignments.officeId)));
  return rows.map((r) => ({
    assignmentId: r.assignmentId,
    officeId: r.officeId!,
    groupId: r.groupId,
    personId: r.personId,
    name: formatFullName(r),
    startDate: r.startDate,
  }));
}

// --- master data: Gliederungen, Ämter, Stände -----------------------------------------

export type GroupRow = {
  id: number;
  name: string;
  parentId: number | null;
  section: Section;
  kind: string | null;
  sortKey: number;
};

export type OfficeRow = { id: number; name: string; rank: number };
export type RankRow = { id: number; name: string; sortOrder: number };

export async function listGroups(): Promise<GroupRow[]> {
  return db
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

/** Which lists each office is an automatic member of (chips on the Ämter page). */
export function officeListRules(): Promise<Map<number, ListRef[]>> {
  return listsUsingRuleTarget("office");
}

// Delete guards. Each returns, per id, the German reason the row cannot be deleted
// (absent = deletable). The delete action and the page's up-front check both use them,
// so the dialog blocks exactly what the server refuses. The checks matter: a rule's
// foreign key cascades, so deleting a ruled Amt/Stand/Gliederung would silently drop the
// rule and change who gets future mailings.

function ruleBlocker(subject: string, lists: ListRef[]): string {
  const names = lists.map((l) => `„${l.listName}“`).join(", ");
  return `${subject} wird noch als Regel ${lists.length === 1 ? "im Verteiler" : "in den Verteilern"} ${names} verwendet. Entferne dort zuerst die Regel.`;
}

export async function officeDeleteBlockers(): Promise<Map<number, string>> {
  const [used, ruleLists] = await Promise.all([
    db
      .select({ id: assignments.officeId, n: count() })
      .from(assignments)
      .where(isNotNull(assignments.officeId))
      .groupBy(assignments.officeId),
    listsUsingRuleTarget("office"),
  ]);
  const out = new Map<number, string>();
  for (const [id, lists] of ruleLists) out.set(id, ruleBlocker("Dieses Amt", lists));
  for (const r of used)
    out.set(
      r.id!,
      "Dieses Amt ist noch Personen zugeordnet (auch frühere Ämter zählen) und kann nicht gelöscht werden.",
    );
  return out;
}

export async function rankDeleteBlockers(): Promise<Map<number, string>> {
  const [used, ruleLists] = await Promise.all([
    db
      .select({ id: persons.rankId, n: count() })
      .from(persons)
      .where(isNotNull(persons.rankId))
      .groupBy(persons.rankId),
    listsUsingRuleTarget("rank"),
  ]);
  const out = new Map<number, string>();
  for (const [id, lists] of ruleLists) out.set(id, ruleBlocker("Dieser Stand", lists));
  for (const r of used)
    out.set(r.id!, "Dieser Stand ist noch Personen zugeordnet und kann nicht gelöscht werden.");
  return out;
}

export async function groupDeleteBlockers(): Promise<Map<number, string>> {
  const [used, children, ruleLists] = await Promise.all([
    db
      .select({ id: assignments.groupId, n: count() })
      .from(assignments)
      .groupBy(assignments.groupId),
    db
      .select({ id: groups.parentId, n: count() })
      .from(groups)
      .where(isNotNull(groups.parentId))
      .groupBy(groups.parentId),
    listsUsingRuleTarget("group"),
  ]);
  const out = new Map<number, string>();
  for (const [id, lists] of ruleLists) out.set(id, ruleBlocker("Diese Gliederung", lists));
  for (const r of used)
    out.set(
      r.id,
      "Diese Gliederung ist noch Personen zugeordnet (auch frühere Ämter zählen) und kann nicht gelöscht werden.",
    );
  for (const r of children)
    out.set(r.id!, "Diese Gliederung hat noch Untergliederungen und kann nicht gelöscht werden.");
  return out;
}

// --- Verteiler ------------------------------------------------------------------------

export type ListMemberRow = {
  personId: number;
  firstName: string | null;
  lastName: string | null;
  scoutName: string | null;
  email: string | null;
  /** The member's senior office (lowest office rank across their active tenures), or null. */
  mainOffice: string | null;
  /** True if added by hand (has a removable membership); false if only via a rule. */
  manual: boolean;
  /** The rules through which this person is auto-included, in display order. */
  via: RuleRef[];
};

export type DistributionListWithMembers = {
  id: number;
  name: string;
  description: string | null;
  /** The list's rules per kind, each in the target's own order. */
  rules: Record<RuleKind, { id: number; name: string }[]>;
  members: ListMemberRow[];
};

/** Every distribution list with its rules and effective members — one shot for /verteiler. */
export async function listDistributionLists(): Promise<DistributionListWithMembers[]> {
  const [lists, { membership, rules }, people, activeOffices] = await Promise.all([
    db
      .select({ id: distributionLists.id, name: distributionLists.name, description: distributionLists.description })
      .from(distributionLists),
    loadEffectiveMembership(),
    // Already in directory order, so members sort by their position here.
    listPersonOptions(),
    db
      .select({ personId: assignments.personId, name: offices.name, rank: offices.rank })
      .from(assignments)
      .innerJoin(offices, eq(offices.id, assignments.officeId))
      .where(isNull(assignments.endDate)),
  ]);

  const personById = new Map(people.map((p) => [p.id, p]));
  const position = new Map(people.map((p, i) => [p.id, i]));
  // The senior *active* office per person (ended tenures never count as a main office).
  const mainOffice = new Map<number, { name: string; rank: number }>();
  for (const o of activeOffices) {
    const current = mainOffice.get(o.personId);
    if (!current || o.rank < current.rank) mainOffice.set(o.personId, o);
  }

  const rulesByList = new Map<number, Record<RuleKind, { id: number; name: string }[]>>();
  for (const r of [...rules].sort(byRuleOrder)) {
    let perKind = rulesByList.get(r.listId);
    if (!perKind) rulesByList.set(r.listId, (perKind = { office: [], rank: [], group: [] }));
    perKind[r.kind].push({ id: r.targetId, name: r.name });
  }

  const viaRefs = viaResolver(rules);
  return lists.sort(byName).map((dl) => {
    const members: ListMemberRow[] = [...(membership.get(dl.id) ?? [])].map(([personId, origin]) => {
      const p = personById.get(personId)!;
      return {
        personId,
        firstName: p.firstName,
        lastName: p.lastName,
        scoutName: p.scoutName,
        email: p.email,
        mainOffice: mainOffice.get(personId)?.name ?? null,
        manual: origin.manual,
        via: viaRefs(origin.via),
      };
    });
    members.sort((a, b) => position.get(a.personId)! - position.get(b.personId)!);
    return {
      ...dl,
      rules: rulesByList.get(dl.id) ?? { office: [], rank: [], group: [] },
      members,
    };
  });
}

/** Names of all distribution lists, for pickers (the editor's checkboxes, "Zu Verteiler hinzufügen"). */
export async function listDistributionListNames(): Promise<{ id: number; name: string }[]> {
  const rows = await db
    .select({ id: distributionLists.id, name: distributionLists.name })
    .from(distributionLists);
  return rows.sort(byName);
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

export type PersonOption = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  scoutName: string | null;
  email: string | null;
  /** Set for deceased persons: the duplicate hint keeps them, the member picker drops them. */
  deathDate: string | null;
};

/**
 * Minimal person list in directory order: the "add members" picker, the duplicate-person
 * hint and the Verteiler members. Memoized per request (the Verteiler page needs it twice).
 */
export const listPersonOptions = cache(async (): Promise<PersonOption[]> => {
  const rows = await db
    .select({
      id: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      scoutName: persons.scoutName,
      email: persons.email,
      deathDate: persons.deathDate,
    })
    .from(persons);
  return sortByDirectoryName(rows);
});

// --- CSV export -----------------------------------------------------------------------

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
  return personsForCsvByIds(await effectiveMemberIds(listId));
}

/**
 * CSV export rows for an explicit selection of person ids, ordered like the directory.
 * Exactly the chosen persons, deceased included: unlike a mailing, a CSV is also a plain
 * data export of what was picked.
 */
export async function personsForCsvByIds(ids: number[]): Promise<CsvPerson[]> {
  if (ids.length === 0) return [];
  return sortByDirectoryName(await db.select(csvColumns).from(persons).where(inArray(persons.id, ids)));
}

// --- mail module (issue #19) ----------------------------------------------------------

/**
 * Raw (nullable, unvalidated) e-mails of the LIVING persons among `ids` — the input to
 * `collectEmails` (src/lib/export.ts). Deceased persons never get mail, even when a stale
 * selection still holds them.
 */
export async function personEmailsByIds(ids: number[]): Promise<(string | null)[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ email: persons.email })
    .from(persons)
    .where(and(inArray(persons.id, ids), isNull(persons.deathDate)));
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
