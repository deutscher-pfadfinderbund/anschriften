import { SECTION_ORDER } from "@/lib/format";

export type GroupNode = {
  id: number;
  name: string;
  parentId: number | null;
  section: string;
  kind: string | null;
  sortKey: number;
};

export type OrderedGroup<T extends GroupNode = GroupNode> = { group: T; depth: number };

/**
 * Flatten the Gliederungen into a stable, hierarchical, indented order:
 * roots first (grouped by section, then sort_key, then name), each followed by
 * its subtree (depth-first, children ordered by sort_key then name).
 * Orphaned parents (parent id missing from the set) are treated as roots.
 */
export function orderGroups<T extends GroupNode>(groups: T[]): OrderedGroup<T>[] {
  const ids = new Set(groups.map((g) => g.id));
  const byParent = new Map<number, T[]>();
  for (const g of groups) {
    const key = g.parentId != null && ids.has(g.parentId) ? g.parentId : -1;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(g);
  }

  const cmp = (a: T, b: T) =>
    a.sortKey - b.sortKey || a.name.localeCompare(b.name, "de");
  for (const list of byParent.values()) list.sort(cmp);

  const roots = (byParent.get(-1) ?? []).slice().sort((a, b) => {
    const sa = SECTION_ORDER.indexOf(a.section as (typeof SECTION_ORDER)[number]);
    const sb = SECTION_ORDER.indexOf(b.section as (typeof SECTION_ORDER)[number]);
    return (sa < 0 ? 99 : sa) - (sb < 0 ? 99 : sb) || cmp(a, b);
  });

  const out: OrderedGroup<T>[] = [];
  const visit = (node: T, depth: number) => {
    out.push({ group: node, depth });
    for (const child of byParent.get(node.id) ?? []) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  return out;
}
