// Pure union/dedupe logic for effective distribution-list membership (issue #16).
// No DB, no React — imported by the query layer and unit-tested with fictional data.
//
// Effective members of a list = manual members (distribution_list_members)
// ∪ persons matched by one of the list's rules (src/lib/rule-kinds.ts):
//   - office: persons *actively* holding the Amt,
//   - rank:   persons carrying the Stand,
//   - group:  persons *actively* assigned to the Gliederung (with or without an Amt).
// The set is deduplicated (a person included several ways appears once). Deceased
// persons are excluded from EVERY half, manual memberships included — no mailing, BCC
// copy or serial letter may reach them. Ended tenures (end_date set) never match a rule.

import type { RuleKind } from "@/lib/rule-kinds";

/** A manual membership row: person `personId` was added to list `listId` by hand. */
export type ManualMembership = { listId: number; personId: number };

/** A rule: list `listId` automatically contains whoever matches Amt/Stand/Gliederung `targetId`. */
export type MembershipRule = { listId: number; kind: RuleKind; targetId: number };

/**
 * Any assignment row, active or ended. `endDate` NULL = currently active (issue #22);
 * only active rows match office/group rules. `officeId` NULL = membership without an Amt.
 */
export type MembershipAssignment = {
  personId: number;
  groupId: number;
  officeId: number | null;
  endDate: string | null;
};

/** Every person: the Stand drives rank rules, the death date excludes them entirely. */
export type MembershipPerson = { id: number; rankId: number | null; deathDate: string | null };

/**
 * All inputs are required on purpose: a forgotten field would silently change who gets
 * mail. Callers load them through the one loader in src/db/queries.ts.
 */
export type EffectiveMembershipInput = {
  manualMembers: ManualMembership[];
  rules: MembershipRule[];
  assignments: MembershipAssignment[];
  persons: MembershipPerson[];
};

/**
 * Why a person is an effective member of a list.
 * - `manual`: they were added by hand (has a removable membership row).
 * - `via`: the rules (kind + target id) through which they are included, deduplicated,
 *   in rule order. A person can be included several ways at once.
 */
export type MemberOrigin = { manual: boolean; via: { kind: RuleKind; id: number }[] };

/**
 * Compute effective membership for every list.
 * Returns a map `listId -> (personId -> origin)`; the inner map's keys are the
 * deduplicated effective members. A list with no member (no living manual member and no
 * rule with a living, active match) has no entry — callers merge with the full list
 * of lists as needed.
 */
export function computeEffectiveMembership(
  input: EffectiveMembershipInput,
): Map<number, Map<number, MemberOrigin>> {
  const deceased = new Set(input.persons.filter((p) => p.deathDate != null).map((p) => p.id));

  // kind -> target id -> living persons currently matching it (deduped).
  const matches: Record<RuleKind, Map<number, Set<number>>> = {
    office: new Map(),
    rank: new Map(),
    group: new Map(),
  };
  const match = (kind: RuleKind, targetId: number, personId: number) => {
    if (deceased.has(personId)) return;
    let set = matches[kind].get(targetId);
    if (!set) matches[kind].set(targetId, (set = new Set()));
    set.add(personId);
  };
  for (const p of input.persons) {
    if (p.rankId != null) match("rank", p.rankId, p.id);
  }
  for (const a of input.assignments) {
    if (a.endDate != null) continue; // ended tenure (history) never confers membership
    match("group", a.groupId, a.personId);
    if (a.officeId != null) match("office", a.officeId, a.personId);
  }

  const result = new Map<number, Map<number, MemberOrigin>>();
  const originOf = (listId: number, personId: number): MemberOrigin => {
    let members = result.get(listId);
    if (!members) result.set(listId, (members = new Map()));
    let origin = members.get(personId);
    if (!origin) members.set(personId, (origin = { manual: false, via: [] }));
    return origin;
  };

  for (const m of input.manualMembers) {
    if (deceased.has(m.personId)) continue;
    originOf(m.listId, m.personId).manual = true;
  }

  for (const rule of input.rules) {
    for (const personId of matches[rule.kind].get(rule.targetId) ?? []) {
      const origin = originOf(rule.listId, personId);
      if (!origin.via.some((v) => v.kind === rule.kind && v.id === rule.targetId))
        origin.via.push({ kind: rule.kind, id: rule.targetId });
    }
  }

  return result;
}
