// Pure union/dedupe logic for effective distribution-list membership (issue #16).
// No DB, no React — imported by the query layer and unit-tested with fictional data.
//
// Effective members of a list = manual members (distribution_list_members)
// ∪ persons holding an office the list has a rule for. The set is deduplicated
// (a person included several ways appears once) and deceased persons are excluded
// from the *rule-based* half only — a deceased person kept manually still counts.

/** A manual membership row: person `personId` was added to list `listId` by hand. */
export type ManualMembership = { listId: number; personId: number };

/** An office rule: list `listId` automatically contains the holder(s) of `officeId`. */
export type OfficeRuleInput = { listId: number; officeId: number };

/** A person's office assignment (only assignments that actually carry an office). */
export type OfficeAssignment = { personId: number; officeId: number };

/**
 * Why a person is an effective member of a list.
 * - `manual`: they were added by hand (has a removable membership row).
 * - `viaOfficeIds`: office ids (rules) through which they are included, deduplicated.
 * A person can be both manual and rule-based at once.
 */
export type MemberOrigin = { manual: boolean; viaOfficeIds: number[] };

export type EffectiveMembershipInput = {
  manualMembers: ManualMembership[];
  officeRules: OfficeRuleInput[];
  officeAssignments: OfficeAssignment[];
  /** Persons excluded from the rule-based half (death_date set). */
  deceasedPersonIds?: Iterable<number>;
};

/**
 * Compute effective membership for every list.
 * Returns a map `listId -> (personId -> origin)`; the inner map's keys are the
 * deduplicated effective members. Lists with a manual member or a matching rule
 * appear; lists mentioned only via an empty rule set still appear if they had a
 * rule but no holder is not represented (no member ⇒ no entry, callers merge with
 * the full list of lists as needed).
 */
export function computeEffectiveMembership(
  input: EffectiveMembershipInput,
): Map<number, Map<number, MemberOrigin>> {
  const deceased = new Set(input.deceasedPersonIds ?? []);

  // office id -> person ids currently holding it (living only, deduped).
  const holdersByOffice = new Map<number, Set<number>>();
  for (const a of input.officeAssignments) {
    if (deceased.has(a.personId)) continue;
    let set = holdersByOffice.get(a.officeId);
    if (!set) holdersByOffice.set(a.officeId, (set = new Set()));
    set.add(a.personId);
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
    if (!o) members.set(personId, (o = { manual: false, viaOfficeIds: [] }));
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

  return result;
}
