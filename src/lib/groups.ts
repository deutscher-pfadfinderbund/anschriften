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
 * Orphaned parents (parent id missing from the set) are treated as roots. Groups caught
 * in a parent cycle (or hanging off one) are unreachable from the real roots; they are
 * emitted as top-level roots too so a bad parent link can never hide them from the UI.
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

  const rootCmp = (a: T, b: T) => {
    const sa = SECTION_ORDER.indexOf(a.section as (typeof SECTION_ORDER)[number]);
    const sb = SECTION_ORDER.indexOf(b.section as (typeof SECTION_ORDER)[number]);
    return (sa < 0 ? 99 : sa) - (sb < 0 ? 99 : sb) || cmp(a, b);
  };
  const roots = (byParent.get(-1) ?? []).slice().sort(rootCmp);

  const out: OrderedGroup<T>[] = [];
  const visited = new Set<number>();
  const visit = (node: T, depth: number) => {
    if (visited.has(node.id)) return; // guard against cycles in the stored data
    visited.add(node.id);
    out.push({ group: node, depth });
    for (const child of byParent.get(node.id) ?? []) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);

  // Defensive: any group not reached from a root is part of a parent cycle (or hangs off
  // one). Emit it as a top-level root so it stays visible and its parent link is
  // repairable — otherwise the whole branch would silently vanish from every view.
  for (const leftover of groups.filter((g) => !visited.has(g.id)).sort(rootCmp)) {
    visit(leftover, 0);
  }
  return out;
}
