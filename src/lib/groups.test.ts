import { describe, expect, it } from "vitest";

import { orderGroups, type GroupNode } from "./groups";

// All test data below is fictitious.

function g(over: Partial<GroupNode> & { id: number }): GroupNode {
  return {
    name: `Gruppe ${over.id}`,
    parentId: null,
    section: "bund",
    kind: null,
    sortKey: 0,
    ...over,
  };
}

/** Convenience: the ordered names, so section/tree order is easy to assert. */
const names = (ordered: ReturnType<typeof orderGroups>) => ordered.map((o) => o.group.name);
/** Convenience: parallel depth array. */
const depths = (ordered: ReturnType<typeof orderGroups>) => ordered.map((o) => o.depth);

describe("orderGroups", () => {
  it("returns an empty list for no groups", () => {
    expect(orderGroups([])).toEqual([]);
  });

  it("groups roots by section (SECTION_ORDER), then sortKey, then name", () => {
    const ordered = orderGroups([
      g({ id: 1, name: "Gau B", section: "jungenbund", sortKey: 20 }),
      g({ id: 2, name: "Bundesführung", section: "bund", sortKey: 10 }),
      g({ id: 3, name: "Gau A", section: "jungenbund", sortKey: 20 }), // same key as Gau B → name tiebreak
      g({ id: 4, name: "Bundesgilde", section: "bundesgilde", sortKey: 10 }),
    ]);
    // bund < jungenbund < bundesgilde; inside jungenbund equal keys sort Gau A before Gau B.
    expect(names(ordered)).toEqual(["Bundesführung", "Gau A", "Gau B", "Bundesgilde"]);
    expect(depths(ordered)).toEqual([0, 0, 0, 0]);
  });

  it("sorts an unknown section last regardless of its sortKey", () => {
    const ordered = orderGroups([
      g({ id: 1, name: "Fremd", section: "gibtsnicht", sortKey: 1 }),
      g({ id: 2, name: "Bund", section: "bund", sortKey: 999 }),
    ]);
    expect(names(ordered)).toEqual(["Bund", "Fremd"]);
  });

  it("nests children depth-first, ordering siblings by sortKey then name with growing depth", () => {
    const ordered = orderGroups([
      g({ id: 1, name: "Gau Franken", section: "jungenbund", sortKey: 10 }),
      g({ id: 2, name: "Jungenschaft B", section: "jungenbund", sortKey: 20, parentId: 1 }),
      g({ id: 3, name: "Jungenschaft A", section: "jungenbund", sortKey: 10, parentId: 1 }),
      g({ id: 4, name: "Meute X", section: "jungenbund", sortKey: 0, parentId: 3 }),
    ]);
    // Depth-first: root, then its first child's whole subtree, then the next child.
    expect(names(ordered)).toEqual([
      "Gau Franken",
      "Jungenschaft A",
      "Meute X",
      "Jungenschaft B",
    ]);
    expect(depths(ordered)).toEqual([0, 1, 2, 1]);
  });

  it("breaks a sibling tie on equal sortKey by name (de collation)", () => {
    const ordered = orderGroups([
      g({ id: 1, name: "Wurzel", section: "bund", sortKey: 0 }),
      g({ id: 2, name: "Zebra", section: "bund", sortKey: 5, parentId: 1 }),
      g({ id: 3, name: "Ähnlich", section: "bund", sortKey: 5, parentId: 1 }),
      g({ id: 4, name: "Anton", section: "bund", sortKey: 5, parentId: 1 }),
    ]);
    // Equal keys → name order: Ähnlich, Anton, Zebra (German collation folds Ä near A).
    expect(names(ordered)).toEqual(["Wurzel", "Ähnlich", "Anton", "Zebra"]);
    expect(depths(ordered)).toEqual([0, 1, 1, 1]);
  });

  it("treats a group whose parentId is missing from the set as a root", () => {
    const ordered = orderGroups([
      g({ id: 1, name: "Waise", section: "bund", sortKey: 5, parentId: 99 }), // parent 99 absent
      g({ id: 2, name: "Wurzel", section: "bund", sortKey: 10 }),
      g({ id: 3, name: "Kind", section: "bund", sortKey: 0, parentId: 2 }),
    ]);
    // The orphan becomes a root (sorted among roots by key: Waise 5 < Wurzel 10);
    // the real child nests under its present parent.
    expect(names(ordered)).toEqual(["Waise", "Wurzel", "Kind"]);
    expect(depths(ordered)).toEqual([0, 0, 1]);
  });

  it("never drops groups caught in a parent cycle (emits them defensively)", () => {
    // A ↔ B point at each other; C is a real root. Without the guard the cycle would
    // both vanish from every view and loop forever. All three must still be present.
    const ordered = orderGroups([
      g({ id: 1, name: "Alpha", section: "bund", sortKey: 0, parentId: 2 }),
      g({ id: 2, name: "Beta", section: "bund", sortKey: 0, parentId: 1 }),
      g({ id: 3, name: "Wurzel", section: "bund", sortKey: 0 }),
    ]);
    // The real root comes out first; the cycle members are recovered as top-level roots,
    // each group appearing exactly once.
    expect(names(ordered).sort()).toEqual(["Alpha", "Beta", "Wurzel"]);
    expect(ordered.length).toBe(3);
    expect(names(ordered)[0]).toBe("Wurzel");
  });
});
