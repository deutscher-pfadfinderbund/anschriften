import { describe, expect, it } from "vitest";

import type { PersonListRow } from "@/db/queries";

import {
  filterPersons,
  hasActiveFilters,
  mailSelection,
  parseDirectoryParams,
  searchIndex,
  skippedNote,
  type DirectoryFilters,
} from "./directory-filter";

// All test data below is fictitious.

function person(overrides: Partial<PersonListRow> & { id: number }): PersonListRow {
  return {
    firstName: null,
    lastName: null,
    scoutName: null,
    rankName: null,
    birthDate: null,
    deathDate: null,
    street: null,
    city: null,
    email: null,
    phones: [],
    doNotPrint: false,
    assignments: [],
    effectiveListIds: [],
    ...overrides,
  };
}

const assignment = (id: number, groupId: number, officeId: number | null = null) => ({
  id,
  groupId,
  groupName: `G${groupId}`,
  officeId,
  officeName: officeId == null ? null : `A${officeId}`,
});

// Jungenbund (1) › Gau Westfalen (2) › Horte Greif (3); Mädchenbund (4) on its own.
const groups = [
  { id: 1, parentId: null },
  { id: 2, parentId: 1 },
  { id: 3, parentId: 2 },
  { id: 4, parentId: null },
];

const anna = person({
  id: 1,
  firstName: "Anna",
  lastName: "Müller",
  scoutName: "Fuchs",
  street: "Lindenstraße 1",
  city: "Münster",
  email: "anna@example.org",
  phones: [{ label: "Mobil", number: "0170 1000003" }],
  assignments: [{ ...assignment(1, 3, 9), groupName: "Horte Greif", officeName: "Gauvogt" }],
  effectiveListIds: [7],
});
const ben = person({
  id: 2,
  firstName: "Ben",
  lastName: "Becker",
  rankName: "Pfadfinder",
  city: "Köln",
  phones: [{ label: "Privat", number: "0221/40003" }],
  assignments: [assignment(2, 2), assignment(3, 4, 9)],
});
const rows = [anna, ben].map((p) => ({ ...p, ...searchIndex(p) }));

const none: DirectoryFilters = { q: "", groupId: null, officeId: null, listId: null };
const ids = (f: Partial<DirectoryFilters>) => filterPersons(rows, { ...none, ...f }, groups).map((p) => p.id);

describe("search", () => {
  it("matches every word in any order, umlaut-insensitive", () => {
    expect(ids({ q: "anna müller" })).toEqual([1]);
    expect(ids({ q: "Mueller Anna" })).toEqual([1]);
    expect(ids({ q: "anna schmidt" })).toEqual([]);
  });

  it("finds the name as the list prints it, with a comma", () => {
    expect(ids({ q: "Müller, Anna" })).toEqual([1]);
    expect(ids({ q: "Müller," })).toEqual([1]);
    expect(ids({ q: "becker;ben" })).toEqual([2]);
  });

  it("searches Amt, Gliederung and Stand as shown in the list", () => {
    expect(ids({ q: "gauvogt" })).toEqual([1]);
    expect(ids({ q: "horte greif" })).toEqual([1]);
    expect(ids({ q: "pfadfinder" })).toEqual([2]);
  });

  it("searches Fahrtenname, street, city and e-mail", () => {
    expect(ids({ q: "fuchs" })).toEqual([1]);
    expect(ids({ q: "lindenstrasse" })).toEqual([1]);
    expect(ids({ q: "koeln" })).toEqual([2]);
    expect(ids({ q: "anna@example" })).toEqual([1]);
  });

  it("compares phone numbers by their digits", () => {
    expect(ids({ q: "0170 1000003" })).toEqual([1]);
    expect(ids({ q: "0170-1000003" })).toEqual([1]);
    expect(ids({ q: "01701000003" })).toEqual([1]);
    expect(ids({ q: "0221 40003" })).toEqual([2]);
    expect(ids({ q: "(0221) 40003" })).toEqual([2]);
  });

  it("does not let a lone separator match everyone", () => {
    expect(ids({ q: "-" })).toEqual([]);
  });

  it("treats separators alone as no search", () => {
    expect(hasActiveFilters({ ...none, q: " , ; " })).toBe(false);
  });

  it("keeps everyone for a blank query", () => {
    expect(ids({ q: "   " })).toEqual([1, 2]);
  });
});

describe("filters", () => {
  it("includes all Untergliederungen of the chosen Gliederung", () => {
    expect(ids({ groupId: 1 })).toEqual([1, 2]);
    expect(ids({ groupId: 2 })).toEqual([1, 2]);
    expect(ids({ groupId: 3 })).toEqual([1]);
    expect(ids({ groupId: 4 })).toEqual([2]);
  });

  it("matches Gliederung and Amt on the same assignment", () => {
    expect(ids({ officeId: 9 })).toEqual([1, 2]);
    // Ben holds A9 only in the Mädchenbund and is a plain member in Gau Westfalen.
    expect(ids({ groupId: 2, officeId: 9 })).toEqual([1]);
  });

  it("filters by effective Verteiler membership", () => {
    expect(ids({ listId: 7 })).toEqual([1]);
  });
});

describe("parseDirectoryParams", () => {
  it("reads the URL state and ignores malformed ids", () => {
    const params = new URLSearchParams("q=anna&gliederung=3&amt=x&verteiler=-1&sortierung=absteigend");
    expect(parseDirectoryParams(params)).toEqual({
      q: "anna",
      groupId: 3,
      officeId: null,
      listId: null,
      sortDesc: true,
    });
    expect(parseDirectoryParams(new URLSearchParams("")).sortDesc).toBe(false);
  });

  it("treats only real filters as active", () => {
    expect(hasActiveFilters(none)).toBe(false);
    expect(hasActiveFilters({ ...none, q: "  " })).toBe(false);
    expect(hasActiveFilters({ ...none, officeId: 2 })).toBe(true);
  });
});

describe("mailSelection", () => {
  it("leaves out deceased persons and counts invalid addresses", () => {
    const sel = mailSelection([
      { id: 1, email: "a@example.org", deathDate: null },
      { id: 2, email: "b@example.org", deathDate: "2020-01-01" },
      { id: 3, email: null, deathDate: null },
      { id: 4, email: "A@example.org", deathDate: null },
    ]);
    expect(sel.personIds).toEqual([1, 3, 4]);
    expect(sel.deceased).toBe(1);
    expect(sel.bcc).toEqual({ text: "a@example.org", count: 1, skipped: 1 });
  });

  it("describes what was skipped", () => {
    expect(skippedNote(0, 0)).toBe("");
    expect(skippedNote(1, 0)).toBe("1 verstorbene Person übersprungen");
    expect(skippedNote(2, 3)).toBe("2 verstorbene Personen und 3 ohne gültige E-Mail übersprungen");
  });
});
