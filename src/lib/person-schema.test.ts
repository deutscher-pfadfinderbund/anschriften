import { describe, expect, it } from "vitest";

import { isValidDate, validateTenure } from "./person-schema";

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
