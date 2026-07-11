import { describe, expect, it } from "vitest";

import { isValidDate, parsePersonInput, resolveTenureEnd, validateTenure } from "./person-schema";

// Fictional dates only — validation logic for the office-history Amtszeiten (issue #22).
describe("isValidDate", () => {
  it("accepts a real ISO calendar date", () => {
    expect(isValidDate("2019-03-01")).toBe(true);
    expect(isValidDate("2000-02-29")).toBe(true); // leap year
  });

  it("rejects malformed strings and impossible days", () => {
    expect(isValidDate("2019-3-1")).toBe(false);
    expect(isValidDate("01.03.2019")).toBe(false);
    expect(isValidDate("2019-02-30")).toBe(false);
    expect(isValidDate("2019-13-01")).toBe(false);
    expect(isValidDate("")).toBe(false);
    expect(isValidDate("morgen")).toBe(false);
  });
});

describe("validateTenure", () => {
  it("passes when both bounds are null (unknown tenure)", () => {
    expect(validateTenure(null, null)).toBeNull();
  });

  it("passes with only a start ('seit …') or only an end ('bis …')", () => {
    expect(validateTenure("2019-03-01", null)).toBeNull();
    expect(validateTenure(null, "2019-03-01")).toBeNull();
  });

  it("passes when the end is on or after the start", () => {
    expect(validateTenure("2015-01-01", "2019-12-31")).toBeNull();
    expect(validateTenure("2019-03-01", "2019-03-01")).toBeNull();
  });

  it("rejects an end before the start with a German message", () => {
    expect(validateTenure("2019-01-01", "2015-01-01")).toBe(
      "Das Bis-Datum darf nicht vor dem Von-Datum liegen.",
    );
  });

  it("rejects malformed dates on either bound", () => {
    expect(validateTenure("01.03.2019", null)).toBe("Ungültiges Von-Datum.");
    expect(validateTenure(null, "2019-02-30")).toBe("Ungültiges Bis-Datum.");
  });
});

// Ending a tenure with a concrete date OR "Ende unbekannt" (issue #26). `today` is
// injected so the tests stay deterministic and use only fictional dates.
describe("resolveTenureEnd", () => {
  const today = "2026-07-04";

  it("with a valid Bis-Datum: keeps it, endUnknown stays false", () => {
    expect(resolveTenureEnd({ startDate: "2015-01-01", endDate: "2019-12-31", endUnknown: false, today })).toEqual({
      ok: true,
      endDate: "2019-12-31",
      endUnknown: false,
    });
  });

  it('"Ende unbekannt": sets end_date = today and endUnknown = true', () => {
    expect(resolveTenureEnd({ startDate: "2015-01-01", endDate: null, endUnknown: true, today })).toEqual({
      ok: true,
      endDate: today,
      endUnknown: true,
    });
  });

  it('"Ende unbekannt" ignores a supplied Bis-Datum and never validates it against the start', () => {
    // A start after `today` would fail validateTenure — but the unknown branch skips it.
    expect(resolveTenureEnd({ startDate: "2099-01-01", endDate: "2000-01-01", endUnknown: true, today })).toEqual({
      ok: true,
      endDate: today,
      endUnknown: true,
    });
  });

  it("rejects a missing Bis-Datum when the end is not unknown", () => {
    const r = resolveTenureEnd({ startDate: "2015-01-01", endDate: null, endUnknown: false, today });
    expect(r).toEqual({ ok: false, message: "Bitte ein Bis-Datum angeben oder „Datum unbekannt“ wählen." });
    expect(resolveTenureEnd({ startDate: null, endDate: "   ", endUnknown: false, today })).toMatchObject({ ok: false });
  });

  it("rejects an invalid or out-of-order Bis-Datum (delegates to validateTenure)", () => {
    expect(resolveTenureEnd({ startDate: null, endDate: "2019-02-30", endUnknown: false, today })).toEqual({
      ok: false,
      message: "Ungültiges Bis-Datum.",
    });
    expect(resolveTenureEnd({ startDate: "2019-01-01", endDate: "2015-01-01", endUnknown: false, today })).toEqual({
      ok: false,
      message: "Das Bis-Datum darf nicht vor dem Von-Datum liegen.",
    });
  });
});

// The cross-field superRefine rules of personInputSchema, exercised through
// parsePersonInput. `base` is otherwise valid so each test isolates one rule.
// All values are fictitious.
function base(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    salutation: null,
    title: null,
    firstName: "Holger",
    lastName: "Specht",
    scoutName: null,
    birthDate: null,
    deathDate: null,
    rankId: null,
    street: null,
    addressExtra: null,
    postalCode: null,
    city: null,
    email: null,
    phones: [],
    notes: null,
    doNotPrint: false,
    assignments: [],
    ...over,
  };
}

describe("personInputSchema: name requirement", () => {
  it("requires a last name or a scout name", () => {
    const r = parsePersonInput(base({ lastName: null, scoutName: null }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.lastName).toBe("Nachname oder Fahrtenname ist erforderlich.");
  });

  it("treats a whitespace-only name as missing", () => {
    const r = parsePersonInput(base({ lastName: "  ", firstName: "  ", scoutName: "   " }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.lastName).toBe("Nachname oder Fahrtenname ist erforderlich.");
  });

  it("accepts a scout name without a civil name", () => {
    const r = parsePersonInput(base({ lastName: null, firstName: null, scoutName: "Falke" }));
    expect(r.ok).toBe(true);
  });

  it("accepts a last name without a scout name", () => {
    const r = parsePersonInput(base({ scoutName: null }));
    expect(r.ok).toBe(true);
  });
});

describe("personInputSchema: e-mail format", () => {
  it("rejects a malformed e-mail address", () => {
    for (const email of ["kein-at", "a@b", "a b@x.de", "@x.de", "a@.de"]) {
      const r = parsePersonInput(base({ email }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.email).toBe("Bitte eine gültige E-Mail-Adresse eingeben.");
    }
  });

  it("accepts a valid e-mail address", () => {
    expect(parsePersonInput(base({ email: "holger.specht@example.org" })).ok).toBe(true);
  });

  it("skips the check for an empty or whitespace-only e-mail", () => {
    expect(parsePersonInput(base({ email: null })).ok).toBe(true);
    expect(parsePersonInput(base({ email: "   " })).ok).toBe(true);
  });
});

describe("personInputSchema: postal code format", () => {
  it("rejects a postal code that is not exactly five digits", () => {
    for (const postalCode of ["1234", "123456", "abcde", "9040a", "90 402"]) {
      const r = parsePersonInput(base({ postalCode }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.postalCode).toBe("Die PLZ muss aus 5 Ziffern bestehen.");
    }
  });

  it("accepts a five-digit postal code", () => {
    expect(parsePersonInput(base({ postalCode: "90402" })).ok).toBe(true);
  });

  it("skips the check for an empty or whitespace-only postal code", () => {
    expect(parsePersonInput(base({ postalCode: null })).ok).toBe(true);
    expect(parsePersonInput(base({ postalCode: "   " })).ok).toBe(true);
  });
});
