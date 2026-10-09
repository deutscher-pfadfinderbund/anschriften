import { describe, expect, it } from "vitest";

import {
  PHONE_LABELS,
  birthYear,
  canonicalPhoneLabel,
  fold,
  formatDate,
  formatDateTime,
  formatFullName,
  formatName,
  formatNameWithScout,
  phoneLabelOptions,
  scoutAddition,
  todayIso,
} from "./format";

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

describe("formatFullName", () => {
  it("reads „Vorname Nachname“ for running text", () => {
    expect(formatFullName({ firstName: " Hannes ", lastName: "Hoffmann", scoutName: "Falke" })).toBe("Hannes Hoffmann");
    expect(formatFullName({ lastName: "Hoffmann" })).toBe("Hoffmann");
    expect(formatFullName({ firstName: "Hannes", lastName: " " })).toBe("Hannes");
  });

  it("falls back to the scout name, then a dash", () => {
    expect(formatFullName({ lastName: null, scoutName: "Falke" })).toBe("Falke");
    expect(formatFullName({})).toBe("—");
  });
});

describe("scoutAddition / formatNameWithScout", () => {
  it("adds the scout name in German quotes next to a real name", () => {
    const p = { lastName: "Specht", firstName: "Holger", scoutName: "Falke" };
    expect(scoutAddition(p)).toBe("Falke");
    expect(formatNameWithScout(p)).toBe("Specht, Holger „Falke“");
    expect(formatNameWithScout({ firstName: "Holger", scoutName: " Falke " })).toBe("Holger „Falke“");
  });

  it("never shows the scout name twice when it is the only name", () => {
    const p = { lastName: " ", firstName: null, scoutName: "Falke" };
    expect(scoutAddition(p)).toBeNull();
    expect(formatNameWithScout(p)).toBe("Falke");
  });

  it("is the plain name without a scout name", () => {
    expect(scoutAddition({ lastName: "Specht", scoutName: "  " })).toBeNull();
    expect(formatNameWithScout({ lastName: "Specht", firstName: "Holger" })).toBe("Specht, Holger");
    expect(formatNameWithScout({})).toBe("—");
  });
});

describe("todayIso (Europe/Berlin)", () => {
  it("returns the Berlin calendar date during the day", () => {
    expect(todayIso(new Date("2026-10-09T10:00:00Z"))).toBe("2026-10-09");
  });

  it("switches to the next day at Berlin midnight in summer time (UTC+2)", () => {
    expect(todayIso(new Date("2026-10-09T21:59:59Z"))).toBe("2026-10-09"); // 23:59:59 CEST
    expect(todayIso(new Date("2026-10-09T22:00:00Z"))).toBe("2026-10-10"); // 00:00 CEST
  });

  it("switches to the next day at Berlin midnight in winter time (UTC+1)", () => {
    expect(todayIso(new Date("2026-01-09T22:59:59Z"))).toBe("2026-01-09"); // 23:59:59 CET
    expect(todayIso(new Date("2026-01-09T23:00:00Z"))).toBe("2026-01-10"); // 00:00 CET
  });

  it("rolls over month and year boundaries", () => {
    expect(todayIso(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });
});

describe("formatDateTime (Europe/Berlin)", () => {
  it("renders German date and time in summer time, independent of the runner's zone", () => {
    expect(formatDateTime(new Date("2026-10-09T16:49:00Z"))).toBe("09.10.2026, 18:49");
    expect(formatDateTime("2026-10-09T22:30:00Z")).toBe("10.10.2026, 00:30");
  });

  it("renders German date and time in winter time", () => {
    expect(formatDateTime(new Date("2026-01-09T16:49:00Z"))).toBe("09.01.2026, 17:49");
  });

  it("returns an empty string for missing or invalid input", () => {
    expect(formatDateTime(null)).toBe("");
    expect(formatDateTime("")).toBe("");
    expect(formatDateTime("kein Datum")).toBe("");
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

describe("canonicalPhoneLabel", () => {
  it("keeps an exact curated label unchanged", () => {
    for (const l of PHONE_LABELS) expect(canonicalPhoneLabel(l)).toBe(l);
  });

  it("maps case and whitespace variants onto the curated spelling", () => {
    expect(canonicalPhoneLabel("mobil")).toBe("Mobil");
    expect(canonicalPhoneLabel("MOBIL")).toBe("Mobil");
    expect(canonicalPhoneLabel(" Privat ")).toBe("Privat");
    expect(canonicalPhoneLabel("dienstlich")).toBe("Dienstlich");
    expect(canonicalPhoneLabel("telefon")).toBe("Telefon");
  });

  it("preserves an unknown label (trimmed) instead of dropping it", () => {
    expect(canonicalPhoneLabel("Büro")).toBe("Büro");
    expect(canonicalPhoneLabel("Handy")).toBe("Handy");
    expect(canonicalPhoneLabel(" dienstl. ")).toBe("dienstl.");
    expect(canonicalPhoneLabel("Tel. Arbeit")).toBe("Tel. Arbeit");
  });

  it("returns an empty string for empty, whitespace-only or missing input", () => {
    expect(canonicalPhoneLabel("")).toBe("");
    expect(canonicalPhoneLabel("   ")).toBe("");
    expect(canonicalPhoneLabel(null)).toBe("");
    expect(canonicalPhoneLabel(undefined)).toBe("");
  });
});

describe("phoneLabelOptions", () => {
  it("offers just the curated list for a known label", () => {
    expect(phoneLabelOptions("Mobil")).toEqual([...PHONE_LABELS]);
    expect(phoneLabelOptions("mobil")).toEqual([...PHONE_LABELS]);
  });

  it("appends an unknown label so the select never renders blank", () => {
    expect(phoneLabelOptions("Büro")).toEqual([...PHONE_LABELS, "Büro"]);
    expect(phoneLabelOptions(" Handy ")).toEqual([...PHONE_LABELS, "Handy"]);
  });

  it("always contains the canonicalised current label", () => {
    for (const raw of ["mobil", " Privat ", "Büro", "dienstl."]) {
      expect(phoneLabelOptions(raw)).toContain(canonicalPhoneLabel(raw));
    }
  });

  it("falls back to the curated list for an empty label", () => {
    expect(phoneLabelOptions("")).toEqual([...PHONE_LABELS]);
    expect(phoneLabelOptions(null)).toEqual([...PHONE_LABELS]);
    expect(phoneLabelOptions(undefined)).toEqual([...PHONE_LABELS]);
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
