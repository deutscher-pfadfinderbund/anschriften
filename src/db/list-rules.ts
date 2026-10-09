import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import {
  distributionListGroupRules,
  distributionListOfficeRules,
  distributionListRankRules,
  distributionLists,
  groups,
  offices,
  ranks,
} from "@/db/schema";
import { collateDe } from "@/lib/name-order";
import { RULE_KINDS, type RuleKind } from "@/lib/rule-kinds";

// Server-side mapping of the three rule kinds (src/lib/rule-kinds.ts) onto their tables.
// The kinds stay three tables so every rule keeps a real foreign key to its target; this
// map is the one place that knows which table and columns belong to which kind.
export const RULE_TABLES = {
  office: {
    rules: distributionListOfficeRules,
    ruleTarget: distributionListOfficeRules.officeId,
    target: offices,
    targetId: offices.id,
    targetName: offices.name,
    targetSort: offices.rank,
    insert: (listId: number, targetId: number) =>
      db.insert(distributionListOfficeRules).values({ listId, officeId: targetId }).onConflictDoNothing(),
  },
  rank: {
    rules: distributionListRankRules,
    ruleTarget: distributionListRankRules.rankId,
    target: ranks,
    targetId: ranks.id,
    targetName: ranks.name,
    targetSort: ranks.sortOrder,
    insert: (listId: number, targetId: number) =>
      db.insert(distributionListRankRules).values({ listId, rankId: targetId }).onConflictDoNothing(),
  },
  group: {
    rules: distributionListGroupRules,
    ruleTarget: distributionListGroupRules.groupId,
    target: groups,
    targetId: groups.id,
    targetName: groups.name,
    targetSort: groups.sortKey,
    insert: (listId: number, targetId: number) =>
      db.insert(distributionListGroupRules).values({ listId, groupId: targetId }).onConflictDoNothing(),
  },
} satisfies Record<RuleKind, unknown>;

/** One rule row with its target resolved: the target's name and its own sort value. */
export type LoadedRule = {
  kind: RuleKind;
  listId: number;
  targetId: number;
  name: string;
  sort: number;
};

/** Every rule of every kind, with the target's name and sort value. */
export async function loadRules(): Promise<LoadedRule[]> {
  const perKind = await Promise.all(
    RULE_KINDS.map(async (kind) => {
      const t = RULE_TABLES[kind];
      const rows = await db
        .select({ listId: t.rules.listId, targetId: t.ruleTarget, name: t.targetName, sort: t.targetSort })
        .from(t.rules)
        .innerJoin(t.target, eq(t.targetId, t.ruleTarget));
      return rows.map((r) => ({ kind, ...r }));
    }),
  );
  return perKind.flat();
}

/** A distribution list a target is used in as a rule (for chips and delete guards). */
export type ListRef = { listId: number; listName: string };

/**
 * Per target id of one kind: the lists that have a rule on it, ordered by list name.
 * Memoized per request (the Ämter page needs it for the chips and the delete guards).
 */
export const listsUsingRuleTarget = cache(async (kind: RuleKind): Promise<Map<number, ListRef[]>> => {
  const t = RULE_TABLES[kind];
  const rows = await db
    .select({ targetId: t.ruleTarget, listId: distributionLists.id, listName: distributionLists.name })
    .from(t.rules)
    .innerJoin(distributionLists, eq(distributionLists.id, t.rules.listId));
  const map = new Map<number, ListRef[]>();
  for (const r of rows.sort((a, b) => collateDe(a.listName, b.listName))) {
    const arr = map.get(r.targetId) ?? [];
    arr.push({ listId: r.listId, listName: r.listName });
    map.set(r.targetId, arr);
  }
  return map;
});
