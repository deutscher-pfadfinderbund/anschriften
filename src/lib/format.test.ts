import { describe, expect, it } from "vitest";

import { birthYear, fold, formatDate, formatName } from "./format";

// All test data below is fictitious.

describe("fold", () => {
  it("folds umlauts the phone-book way (ae/oe/ue) and lower-cases", () => {
    expect(fold("Müller")).toBe("mueller");
    expect(fold("Örni")).toBe("oerni");
    expect(fold("Bär")).toBe("baer");
  });

  it("expands ß to ss", () => {
    expect(fold("Weiß")).toBe("weiss");
    expect(fold("Straße")).toBe("strasse");
  });

  it("removes generic (non-umlaut) accents", () => {
    expect(fold("Éléonore")).toBe("eleonore");
    expect(fold("café")).toBe("cafe");
  });

  it("folds decomposed (combining-diacritic) umlauts identically to composed ones", () => {
    // "Öhmann" written as O + combining diaeresis must fold like the precomposed form.
    expect(fold("Öhmann")).toBe(fold("Öhmann"));
    expect(fold("Öhmann")).toBe("oehmann");
    expect(fold("Müller")).toBe("mueller");
  });

  it("orders names by the DIN 5007-2 phone-book key", () => {
    const names = ["Zeder", "Öhmann", "Aal", "Müller", "Muhs", "Munz"];
    const sorted = [...names].sort((a, b) => fold(a).localeCompare(fold(b), "de"));
    // ae-fold: Müller -> "mueller" sorts before Muhs/Munz because 'e' < 'h' < 'n'.
    expect(sorted).toEqual(["Aal", "Müller", "Muhs", "Munz", "Öhmann", "Zeder"]);
  });

  it("trims surrounding whitespace", () => {
    expect(fold("  Falke  ")).toBe("falke");
  });
});

describe("formatName", () => {
  it("joins last and first name as 'Nachname, Vorname'", () => {
    expect(formatName({ lastName: "Specht", firstName: "Holger" })).toBe("Specht, Holger");
  });

  it("falls back to the last name alone", () => {
    expect(formatName({ lastName: "Specht" })).toBe("Specht");
  });

  it("falls back to the first name alone", () => {
    expect(formatName({ firstName: "Holger" })).toBe("Holger");
  });

  it("falls back to the scout name when no civil name is set", () => {
    expect(formatName({ scoutName: "Falke" })).toBe("Falke");
    // Whitespace-only civil names are treated as empty and skipped.
    expect(formatName({ lastName: "  ", firstName: "  ", scoutName: " Falke " })).toBe("Falke");
  });

  it("returns the em dash when nothing is set", () => {
    expect(formatName({})).toBe("—");
    expect(formatName({ lastName: null, firstName: null, scoutName: null })).toBe("—");
    expect(formatName({ lastName: "", firstName: "", scoutName: "  " })).toBe("—");
  });
});

describe("formatDate", () => {
  it("reformats an ISO date to dd.MM.yyyy", () => {
    expect(formatDate("2019-06-24")).toBe("24.06.2019");
    expect(formatDate("1985-03-12T12:00:00")).toBe("12.03.1985"); // ignores a trailing time
  });

  it("returns an empty string for null or empty input", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
  });

  it("returns non-ISO input unchanged", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
    expect(formatDate("24.06.2019")).toBe("24.06.2019");
  });
});

describe("birthYear", () => {
  it("extracts the year of an ISO date", () => {
    expect(birthYear("1985-03-12")).toBe(1985);
    expect(birthYear("2000")).toBe(2000);
  });

  it("returns null for null, empty or non-numeric input", () => {
    expect(birthYear(null)).toBeNull();
    expect(birthYear(undefined)).toBeNull();
    expect(birthYear("")).toBeNull();
    expect(birthYear("morgen")).toBeNull();
  });
});
