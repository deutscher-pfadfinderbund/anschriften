import { describe, expect, it } from "vitest";

import { isDuplicateName, nextOrder, ORDER_ERROR, ORDER_MAX, orderError, parseOrder } from "./master-data";

describe("parseOrder", () => {
  it("reads whole numbers, trimmed", () => {
    expect(parseOrder("0")).toBe(0);
    expect(parseOrder(" 120 ")).toBe(120);
    expect(parseOrder("007")).toBe(7);
    expect(parseOrder(String(ORDER_MAX))).toBe(ORDER_MAX);
  });

  it("returns null for an empty field", () => {
    expect(parseOrder("")).toBeNull();
    expect(parseOrder("   ")).toBeNull();
  });

  it("rejects what the server rejects", () => {
    for (const bad of ["-1", "1.5", "1,5", "1e3", "abc", "12a", String(ORDER_MAX + 1)])
      expect(parseOrder(bad)).toBeUndefined();
  });
});

describe("orderError", () => {
  it("accepts a valid number", () => {
    expect(orderError("40")).toBeNull();
  });

  it("rejects an invalid number", () => {
    expect(orderError("4,5")).toBe(ORDER_ERROR);
    expect(orderError("4,5", true)).toBe(ORDER_ERROR);
  });

  it("accepts an empty field only when allowed", () => {
    expect(orderError("")).toBe(ORDER_ERROR);
    expect(orderError("", true)).toBeNull();
  });
});

describe("nextOrder", () => {
  it("is 10 after the largest value", () => {
    expect(nextOrder([10, 80, 20])).toBe(90);
  });

  it("starts at 10 for an empty list", () => {
    expect(nextOrder([])).toBe(10);
  });

  it("never exceeds the server's maximum", () => {
    expect(nextOrder([ORDER_MAX - 3])).toBe(ORDER_MAX);
  });
});

describe("isDuplicateName", () => {
  const entries = [
    { id: 1, name: "Bundesvogt" },
    { id: 2, name: "Gauvogt" },
  ];

  it("finds another entry with the same trimmed name", () => {
    expect(isDuplicateName(" Gauvogt ", entries, null)).toBe(true);
    expect(isDuplicateName("Gauvogt", entries, 1)).toBe(true);
  });

  it("ignores the entry being edited", () => {
    expect(isDuplicateName("Gauvogt", entries, 2)).toBe(false);
  });

  it("compares exactly like the UNIQUE index (case-sensitive) and skips blanks", () => {
    expect(isDuplicateName("gauvogt", entries, null)).toBe(false);
    expect(isDuplicateName("  ", [{ id: 3, name: "" }], null)).toBe(false);
  });
});
