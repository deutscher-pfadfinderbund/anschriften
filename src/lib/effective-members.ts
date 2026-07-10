// Pure union/dedupe logic for effective distribution-list membership (issue #16).
// No DB, no React — imported by the query layer and unit-tested with fictional data.
//
// Effective members of a list = manual members (distribution_list_members)
// ∪ persons *actively* holding an office the list has a rule for
// ∪ persons carrying a Stand (rank) the list has a rule for
// ∪ persons *actively* assigned to a Gliederung (group) the list has a rule for.
// The set is deduplicated (a person included several ways appears once); deceased
// persons and ended office/group tenures (end_date set) are excluded from every
// *rule-based* half — a deceased person kept manually still counts.

/** A manual membership row: person `personId` was added to list `listId` by hand. */
export type ManualMembership = { listId: number; personId: number };

/** An office rule: list `listId` automatically contains the holder(s) of `officeId`. */
export type OfficeRuleInput = { listId: number; officeId: number };

/** A rank rule: list `listId` automatically contains everyone carrying Stand `rankId`. */
export type RankRuleInput = { listId: number; rankId: number };

/** A group rule: list `listId` automatically contains everyone active in Gliederung `groupId`. */
export type GroupRuleInput = { listId: number; groupId: number };

/**
 * A person's office assignment (only assignments that actually carry an office).
 * `endDate` is the Amtszeit end (issue #22): NULL = currently active, set = ended.
 * Required (not optional) so every DB caller must supply it — a forgotten field
 * would otherwise silently leak past office holders into the mail recipients.
 */
export type OfficeAssignment = { personId: number; officeId: number; endDate: string | null };

/**
 * A person's group assignment (any assignment, with or without an office). Drives the
 * group rules. `endDate` NULL = currently active, set = ended tenure (excluded).
 */
export type GroupAssignment = { personId: number; groupId: number; endDate: string | null };

/** A person's Stand. Unlike offices/groups a rank has no tenure — it is a plain property. */
export type PersonRank = { personId: number; rankId: number };

/**
 * Why a person is an effective member of a list.
 * - `manual`: they were added by hand (has a removable membership row).
 * - `viaOfficeIds`: office ids (rules) through which they are included, deduplicated.
 * - `viaRankIds`: rank ids (rules) through which they are included, deduplicated.
 * - `viaGroupIds`: group ids (rules) through which they are included, deduplicated.
 * A person can be included several ways at once.
 */
export type MemberOrigin = {
  manual: boolean;
  viaOfficeIds: number[];
  viaRankIds: number[];
  viaGroupIds: number[];
};

export type EffectiveMembershipInput = {
  manualMembers: ManualMembership[];
  officeRules: OfficeRuleInput[];
  rankRules?: RankRuleInput[];
  groupRules?: GroupRuleInput[];
  officeAssignments: OfficeAssignment[];
  groupAssignments?: GroupAssignment[];
  personRanks?: PersonRank[];
  /** Persons excluded from the rule-based half (death_date set). */
  deceasedPersonIds?: Iterable<number>;
};

/**
 * Compute effective membership for every list.
 * Returns a map `listId -> (personId -> origin)`; the inner map's keys are the
 * deduplicated effective members. A list with no member (no manual member and no
 * rule with a living, active match) has no entry — callers merge with the full list
 * of lists as needed.
 */
export function computeEffectiveMembership(
  input: EffectiveMembershipInput,
): Map<number, Map<number, MemberOrigin>> {
  const deceased = new Set(input.deceasedPersonIds ?? []);

  // office id -> person ids currently holding it (living only, deduped).
  const holdersByOffice = new Map<number, Set<number>>();
  for (const a of input.officeAssignments) {
    if (a.endDate != null) continue; // ended tenure (history) never confers membership
    if (deceased.has(a.personId)) continue;
    let set = holdersByOffice.get(a.officeId);
    if (!set) holdersByOffice.set(a.officeId, (set = new Set()));
    set.add(a.personId);
  }

  // group id -> person ids currently active in it (living only, deduped).
  const membersByGroup = new Map<number, Set<number>>();
  for (const a of input.groupAssignments ?? []) {
    if (a.endDate != null) continue;
    if (deceased.has(a.personId)) continue;
    let set = membersByGroup.get(a.groupId);
    if (!set) membersByGroup.set(a.groupId, (set = new Set()));
    set.add(a.personId);
  }

  // rank id -> person ids carrying it (living only, deduped).
  const personsByRank = new Map<number, Set<number>>();
  for (const pr of input.personRanks ?? []) {
    if (deceased.has(pr.personId)) continue;
    let set = personsByRank.get(pr.rankId);
    if (!set) personsByRank.set(pr.rankId, (set = new Set()));
    set.add(pr.personId);
  }

  const result = new Map<number, Map<number, MemberOrigin>>();
  const listMembers = (listId: number): Map<number, MemberOrigin> => {
    let m = result.get(listId);
    if (!m) result.set(listId, (m = new Map()));
    return m;
  };
  const memberOrigin = (listId: number, personId: number): MemberOrigin => {
    const members = listMembers(listId);
    let o = members.get(personId);
    if (!o)
      members.set(
        personId,
        (o = { manual: false, viaOfficeIds: [], viaRankIds: [], viaGroupIds: [] }),
      );
    return o;
  };

  for (const m of input.manualMembers) {
    memberOrigin(m.listId, m.personId).manual = true;
  }

  for (const rule of input.officeRules) {
    const holders = holdersByOffice.get(rule.officeId);
    if (!holders) continue;
    for (const personId of holders) {
      const origin = memberOrigin(rule.listId, personId);
      if (!origin.viaOfficeIds.includes(rule.officeId)) origin.viaOfficeIds.push(rule.officeId);
    }
  }

  for (const rule of input.rankRules ?? []) {
    const holders = personsByRank.get(rule.rankId);
    if (!holders) continue;
    for (const personId of holders) {
      const origin = memberOrigin(rule.listId, personId);
      if (!origin.viaRankIds.includes(rule.rankId)) origin.viaRankIds.push(rule.rankId);
    }
  }

  for (const rule of input.groupRules ?? []) {
    const holders = membersByGroup.get(rule.groupId);
    if (!holders) continue;
    for (const personId of holders) {
      const origin = memberOrigin(rule.listId, personId);
      if (!origin.viaGroupIds.includes(rule.groupId)) origin.viaGroupIds.push(rule.groupId);
    }
  }

  return result;
}
