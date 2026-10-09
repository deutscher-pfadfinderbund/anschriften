// The three kinds of automatic Verteiler rules (issue #16 and follow-ups): a list
// automatically contains whoever actively holds an Amt, carries a Stand or is actively
// assigned to a Gliederung it has a rule for. One concept, so one list of kinds and one
// label map — shared by the query layer, the actions and the UI. Pure, client-safe.
// The server-side table mapping lives in src/db/list-rules.ts.

export const RULE_KINDS = ["office", "rank", "group"] as const;

export type RuleKind = (typeof RULE_KINDS)[number];

/** German noun per kind ("über Amt: …", "Stand: …"). */
export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  office: "Amt",
  rank: "Stand",
  group: "Gliederung",
};

/** A resolved rule target: the Amt/Stand/Gliederung a rule (or a membership) points at. */
export type RuleRef = { kind: RuleKind; id: number; name: string };
