import { describe, expect, it } from "vitest";

import type { PersonEditData } from "@/db/queries";

import {
  NONE,
  endChoiceError,
  isEndChoiceReady,
  keyRowErrors,
  snapshot,
  toFormValues,
  toPayload,
} from "./form-values";

// All test data below is fictitious.
const person: PersonEditData = {
  id: 7,
  salutation: null,
  title: null,
  firstName: "Hannes",
  lastName: "Hoffmann",
  scoutName: null,
  birthDate: null,
  deathDate: null,
  rankId: 3,
  street: null,
  addressExtra: null,
  postalCode: null,
  city: null,
  email: null,
  phones: [{ label: " mobil ", number: "0911 1234" }],
  notes: null,
  doNotPrint: false,
  updatedAt: "2026-10-09T10:00:00.000Z",
  updatedBy: null,
  assignments: [{ id: 11, groupId: 2, officeId: 4, startDate: "2022-01-01" }],
  historicalAssignments: [],
  distributionListIds: [5, 2],
  ruleMemberships: [],
};

describe("toFormValues", () => {
  it("starts an empty form without phone or assignment rows", () => {
    const v = toFormValues();
    expect(v.phones).toEqual([]);
    expect(v.assignments).toEqual([]);
    expect(v.salutation).toBe(NONE);
    expect(v.rankId).toBe(NONE);
  });

  it("canonicalises phone labels and sorts the list ids", () => {
    const v = toFormValues(person);
    expect(v.phones[0].label).toBe("Mobil");
    expect(v.listIds).toEqual([2, 5]);
    expect(v.rankId).toBe("3");
  });
});

describe("snapshot (dirty check)", () => {
  it("is stable for fresh props, so the baseline can follow the server", () => {
    expect(snapshot(toFormValues(person))).toBe(snapshot(toFormValues({ ...person })));
  });

  it("ignores row keys and ids but sees real edits", () => {
    const v = toFormValues(person);
    const readded = { ...v, assignments: v.assignments.map((a) => ({ ...a, key: "k9", id: null })) };
    expect(snapshot(readded)).toBe(snapshot(v));
    const ended = {
      ...v,
      assignments: v.assignments.map((a) => ({ ...a, end: { endDate: "2026-10-01", endUnknown: false } })),
    };
    expect(snapshot(ended)).not.toBe(snapshot(v));
  });
});

describe("toPayload", () => {
  it("maps the NONE sentinels and buffered endings", () => {
    const v = toFormValues(person);
    v.assignments = [
      { ...v.assignments[0], end: { endDate: "2026-10-01", endUnknown: false } },
      { key: "k1", id: null, groupId: 3, officeId: null, startDate: "", end: { endDate: "2026-10-01", endUnknown: true } },
    ];
    const p = toPayload(v, person, [{ assignmentId: 1, name: "Anna Müller", endDate: "", endUnknown: true }]);
    expect(p.salutation).toBeNull();
    expect(p.rankId).toBe(3);
    expect(p.updatedAt).toBe(person.updatedAt);
    expect(p.assignments).toEqual([
      { groupId: 2, officeId: 4, startDate: "2022-01-01", endDate: "2026-10-01", endUnknown: false },
      { groupId: 3, officeId: null, startDate: "", endDate: null, endUnknown: true },
    ]);
    expect(p.endPrevious).toEqual([{ assignmentId: 1, endDate: null, endUnknown: true }]);
  });
});

describe("keyRowErrors", () => {
  it("re-keys positional row errors by row key and passes the rest through", () => {
    const rows = toFormValues(person).assignments;
    expect(
      keyRowErrors({ lastName: "x", "assignments.0.groupId": "y", "assignments.5.startDate": "z" }, rows),
    ).toEqual({ lastName: "x", "a0.groupId": "y", "assignments.5.startDate": "z" });
  });
});

describe("endChoiceError / isEndChoiceReady", () => {
  const today = "2026-10-09";
  const at = (endDate: string, endUnknown = false) => ({ endDate, endUnknown });

  it("accepts today, a past date after the start, or „Ende unbekannt“", () => {
    expect(isEndChoiceReady(at(today), "2022-01-01", today)).toBe(true);
    expect(isEndChoiceReady(at("", true), "2030-01-01", today)).toBe(true);
  });

  it("is not ready without a date, but shows no error for that", () => {
    expect(endChoiceError(at(""), null, today)).toBeNull();
    expect(isEndChoiceReady(at(""), null, today)).toBe(false);
  });

  it("rejects a future date and one before the start", () => {
    expect(endChoiceError(at("2026-10-10"), null, today)).toMatch(/Zukunft/);
    expect(endChoiceError(at("2021-12-31"), "2022-01-01", today)).toBe(
      "Das Bis-Datum darf nicht vor dem Beginn (01.01.2022) liegen.",
    );
    expect(isEndChoiceReady(at("2021-12-31"), "2022-01-01", today)).toBe(false);
  });
});
