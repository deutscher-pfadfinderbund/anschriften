import { describe, expect, it } from "vitest";

import {
  isValidDate,
  parsePersonInput,
  type PersonData,
  resolveTenureEnd,
  validatePersonDates,
  validateTenure,
} from "./person-schema";

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

  it("rejects a Bis-Datum in the future (active means: no end date)", () => {
    const today = "2026-07-04";
    expect(validateTenure("2015-01-01", "2026-07-05", today)).toBe(
      "Das Bis-Datum darf nicht in der Zukunft liegen – lass das Amt bis dahin aktiv.",
    );
    expect(validateTenure(null, "2030-01-01", today)).not.toBeNull();
    // Ending today is fine — that is the default of „Amt beenden“.
    expect(validateTenure("2015-01-01", today, today)).toBeNull();
  });

  it("checks against the real (Berlin) today when none is passed", () => {
    expect(validateTenure(null, "2999-01-01")).not.toBeNull();
    expect(validateTenure(null, "2000-01-01")).toBeNull();
  });
});

describe("validatePersonDates", () => {
  it("passes when both dates are null (unknown)", () => {
    expect(validatePersonDates(null, null)).toBeNull();
  });

  it("passes with only a birth date or only a death date", () => {
    expect(validatePersonDates("1950-05-01", null)).toBeNull();
    expect(validatePersonDates(null, "2020-05-01")).toBeNull();
  });

  it("passes when the death is on or after the birth", () => {
    expect(validatePersonDates("1950-05-01", "2020-05-01")).toBeNull();
    expect(validatePersonDates("1950-05-01", "1950-05-01")).toBeNull();
  });

  it("rejects a malformed birth or death date with a German message", () => {
    expect(validatePersonDates("01.05.1950", null)).toEqual({ field: "birthDate", message: "Ungültiges Geburtsdatum." });
    expect(validatePersonDates(null, "2020-02-30")).toEqual({ field: "deathDate", message: "Ungültiges Sterbedatum." });
  });

  it("rejects a death date before the birth date", () => {
    expect(validatePersonDates("1950-05-01", "1940-05-01")).toEqual({
      field: "deathDate",
      message: "Das Sterbedatum darf nicht vor dem Geburtsdatum liegen.",
    });
  });

  it("rejects life dates in the future (today itself is fine)", () => {
    const today = "2026-10-09";
    expect(validatePersonDates("2026-10-10", null, today)?.field).toBe("birthDate");
    expect(validatePersonDates(null, "2026-10-10", today)).toEqual({
      field: "deathDate",
      message: "Das Sterbedatum darf nicht in der Zukunft liegen.",
    });
    expect(validatePersonDates(today, today, today)).toBeNull();
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
    expect(r).toEqual({ ok: false, message: "Bitte gib ein Bis-Datum an oder wähle „Ende unbekannt“." });
    expect(resolveTenureEnd({ startDate: null, endDate: "   ", endUnknown: false, today })).toMatchObject({ ok: false });
  });

  it("rejects a Bis-Datum after the injected today", () => {
    expect(resolveTenureEnd({ startDate: "2015-01-01", endDate: "2026-07-05", endUnknown: false, today })).toEqual({
      ok: false,
      message: "Das Bis-Datum darf nicht in der Zukunft liegen – lass das Amt bis dahin aktiv.",
    });
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

/** Parse `base(over)` and return the normalised data (fails the test on errors). */
function parsed(over: Record<string, unknown>): PersonData {
  const r = parsePersonInput(base(over));
  if (!r.ok) throw new Error(`unexpected errors: ${JSON.stringify(r.errors)}`);
  return r.data;
}

describe("personInputSchema: normalisation (parse once, no second cleaning pass)", () => {
  it("trims every text field and turns blanks into null", () => {
    const d = parsed({
      title: "  Dr. ",
      firstName: " Holger ",
      street: "   ",
      city: "",
      email: "  holger.specht@example.org ",
      notes: " \n ",
      postalCode: " 90402 ",
    });
    expect(d.title).toBe("Dr.");
    expect(d.firstName).toBe("Holger");
    expect(d.street).toBeNull();
    expect(d.city).toBeNull();
    expect(d.email).toBe("holger.specht@example.org");
    expect(d.notes).toBeNull();
    expect(d.postalCode).toBe("90402");
  });

  it("accepts missing optional fields as null", () => {
    const d = parsed({ title: undefined, street: undefined });
    expect(d.title).toBeNull();
    expect(d.street).toBeNull();
  });

  it("drops blank phone numbers, trims and defaults the label", () => {
    const d = parsed({
      phones: [
        { label: " Privat ", number: " 0911 5550172 " },
        { label: "Mobil", number: "   " },
        { label: "  ", number: "0170 5550199" },
        { label: null, number: "030 5550111" },
      ],
    });
    expect(d.phones).toEqual([
      { label: "Privat", number: "0911 5550172" },
      { label: "Telefon", number: "0170 5550199" },
      { label: "Telefon", number: "030 5550111" },
    ]);
  });

  it("dedupes the manual list ids", () => {
    expect(parsed({ distributionListIds: [3, 1, 3] }).distributionListIds).toEqual([3, 1]);
  });

  it("rejects an over-long text with a German message", () => {
    const r = parsePersonInput(base({ city: "x".repeat(201) }));
    expect(r).toEqual({ ok: false, errors: { city: "Eingabe ist zu lang (max. 200 Zeichen)." } });
  });

  it("marks the offending life date", () => {
    const bad = parsePersonInput(base({ birthDate: "01.05.1950" }));
    expect(bad.ok ? null : bad.errors).toEqual({ birthDate: "Ungültiges Geburtsdatum." });
    const order = parsePersonInput(base({ birthDate: "1950-05-01", deathDate: "1940-05-01" }));
    expect(order.ok ? null : order.errors).toEqual({
      deathDate: "Das Sterbedatum darf nicht vor dem Geburtsdatum liegen.",
    });
  });
});

describe("personInputSchema: assignment rows", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    groupId: 5,
    officeId: null,
    startDate: "",
    endDate: "",
    ...over,
  });

  it("drops an entirely empty row and normalises blank dates", () => {
    const d = parsed({ assignments: [row({ groupId: null }), row({ officeId: 7, startDate: " 2019-03-01 " })] });
    expect(d.assignments).toEqual([
      { groupId: 5, officeId: 7, startDate: "2019-03-01", endDate: null, endUnknown: false },
    ]);
  });

  it("rejects an Amt without a Gliederung instead of dropping it silently", () => {
    const r = parsePersonInput(base({ assignments: [row({ groupId: null, officeId: 7 })] }));
    expect(r.ok ? null : r.errors).toEqual({
      "assignments.0.groupId": "Bitte eine Gliederung wählen.",
    });
  });

  it("rejects dates without a Gliederung too", () => {
    const r = parsePersonInput(base({ assignments: [row({ groupId: null, startDate: "2019-03-01" })] }));
    expect(r.ok).toBe(false);
  });

  it("validates the tenure per row with a field path", () => {
    const bad = parsePersonInput(base({ assignments: [row({ startDate: "2019-01-01", endDate: "2015-01-01" })] }));
    expect(bad.ok ? null : bad.errors).toEqual({
      "assignments.0.endDate": "Das Bis-Datum darf nicht vor dem Von-Datum liegen.",
    });
    const start = parsePersonInput(base({ assignments: [row({ startDate: "1.3.2019" })] }));
    expect(start.ok ? null : start.errors).toEqual({ "assignments.0.startDate": "Ungültiges Von-Datum." });
    const future = parsePersonInput(base({ assignments: [row({ endDate: "2999-01-01" })] }));
    expect(future.ok ? null : Object.keys(future.errors)).toEqual(["assignments.0.endDate"]);
  });

  it("accepts a finished tenure: a Bis-Datum or „Ende unbekannt“ (no date needed)", () => {
    const d = parsed({
      assignments: [
        row({ officeId: 7, startDate: "2015-01-01", endDate: "2019-12-31" }),
        row({ officeId: 8, endUnknown: true }),
      ],
    });
    expect(d.assignments.map((a) => [a.endDate, a.endUnknown])).toEqual([
      ["2019-12-31", false],
      [null, true],
    ]);
  });

  it("refuses an exact duplicate but allows the same combination once active and once ended", () => {
    const dup = parsePersonInput(base({ assignments: [row({ officeId: 7 }), row({ officeId: 7 })] }));
    expect(dup.ok ? null : dup.errors).toEqual({
      "assignments.1.groupId": "Dieselbe Amt-Gliederungs-Kombination ist doppelt zugeordnet.",
    });
    expect(
      parsePersonInput(base({ assignments: [row({ officeId: 7 }), row({ officeId: 7, endDate: "2019-12-31" })] })).ok,
    ).toBe(true);
  });
});
