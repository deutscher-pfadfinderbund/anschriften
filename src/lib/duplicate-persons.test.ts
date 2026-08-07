import { describe, expect, it } from "vitest";

import { findSimilarPersons, MAX_SIMILAR, type PersonCandidate } from "./duplicate-persons";

// All test data below is fictitious.

const candidates: PersonCandidate[] = [
  { id: 1, firstName: "Holger", lastName: "Specht", scoutName: "Falke" },
  { id: 2, firstName: "Anna", lastName: "Müller", scoutName: null },
  { id: 3, firstName: null, lastName: "Specht", scoutName: null },
  { id: 4, firstName: "Bernd", lastName: "Zeder", scoutName: "Luchs" },
];

describe("findSimilarPersons", () => {
  it("matches an exact first + last name", () => {
    const hits = findSimilarPersons(
      { firstName: "Holger", lastName: "Specht" },
      candidates,
    );
    expect(hits.map((h) => h.id)).toEqual([1, 3]); // id 3 has no first name → compatible
  });

  it("matches when either first name is empty (same last name)", () => {
    const hits = findSimilarPersons({ lastName: "Specht" }, candidates);
    expect(hits.map((h) => h.id)).toEqual([1, 3]);
  });

  it("does NOT match when both first names are set but differ", () => {
    const hits = findSimilarPersons(
      { firstName: "Ingrid", lastName: "Specht" },
      candidates,
    );
    expect(hits.map((h) => h.id)).toEqual([3]); // only the first-name-less entry stays
  });

  it("matches on the Fahrtenname (scout name) alone", () => {
    const hits = findSimilarPersons({ scoutName: "Falke" }, candidates);
    expect(hits.map((h) => h.id)).toEqual([1]);
  });

  it("returns nothing on a clear non-match", () => {
    const hits = findSimilarPersons(
      { firstName: "Xaver", lastName: "Habicht" },
      candidates,
    );
    expect(hits).toEqual([]);
  });

  it("stays silent until at least a last name or scout name is entered", () => {
    expect(findSimilarPersons({ firstName: "Holger" }, candidates)).toEqual([]);
    expect(findSimilarPersons({}, candidates)).toEqual([]);
    expect(findSimilarPersons({ lastName: "  " }, candidates)).toEqual([]);
  });

  it("folds umlauts the DIN 5007-2 way (Müller == Mueller, Bär == Baer)", () => {
    expect(findSimilarPersons({ lastName: "Mueller" }, candidates).map((h) => h.id)).toEqual([2]);
    expect(findSimilarPersons({ lastName: "MÜLLER" }, candidates).map((h) => h.id)).toEqual([2]);

    const baer: PersonCandidate[] = [{ id: 9, firstName: null, lastName: "Bär", scoutName: null }];
    expect(findSimilarPersons({ lastName: "Baer" }, baer).map((h) => h.id)).toEqual([9]);
  });

  it("folds the scout name too", () => {
    const list: PersonCandidate[] = [{ id: 7, firstName: null, lastName: null, scoutName: "Käfer" }];
    expect(findSimilarPersons({ scoutName: "Kaefer" }, list).map((h) => h.id)).toEqual([7]);
  });

  it("caps the result at MAX_SIMILAR (default 5)", () => {
    const many: PersonCandidate[] = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      firstName: null,
      lastName: "Adler",
      scoutName: null,
    }));
    const hits = findSimilarPersons({ lastName: "Adler" }, many);
    expect(hits).toHaveLength(MAX_SIMILAR);
    expect(hits.map((h) => h.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("honours an explicit lower limit", () => {
    const many: PersonCandidate[] = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      firstName: null,
      lastName: "Adler",
      scoutName: null,
    }));
    expect(findSimilarPersons({ lastName: "Adler" }, many, 2)).toHaveLength(2);
  });
});
