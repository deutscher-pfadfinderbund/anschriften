import { describe, expect, it } from "vitest";
import {
  buildGroupChain,
  buildPhones,
  deriveKind,
  normalizeAelterengemeinschaft,
  parseBool,
  parseDate,
  parseHilfsgruppe,
  rankForOffice,
  resolveLegacyIds,
  sectionForSortKey,
  splitOffices,
} from "./import-parse";

// All test data below is fictitious.

describe("parseHilfsgruppe", () => {
  it('parses "NNN Name" into sortKey and name', () => {
    expect(parseHilfsgruppe("110 Gau Beispiel")).toEqual({ sortKey: 110, name: "Gau Beispiel" });
    expect(parseHilfsgruppe("010 Musterführung")).toEqual({ sortKey: 10, name: "Musterführung" });
  });
  it("trims surrounding whitespace of the name", () => {
    expect(parseHilfsgruppe("300 Landesämter  ")).toEqual({ sortKey: 300, name: "Landesämter" });
  });
  it("returns null when there is no numeric prefix", () => {
    expect(parseHilfsgruppe("Gau ohne Nummer")).toBeNull();
    expect(parseHilfsgruppe("")).toBeNull();
  });
});

describe("sectionForSortKey", () => {
  it("maps the special sub-branches inside 0xx", () => {
    expect(sectionForSortKey(30)).toBe("jungenbund");
    expect(sectionForSortKey(40)).toBe("maedchenbund");
  });
  it("maps the remaining 0xx to bund", () => {
    expect(sectionForSortKey(10)).toBe("bund");
    expect(sectionForSortKey(25)).toBe("bund");
  });
  it("maps 1xx and 210/230 to jungenbund", () => {
    expect(sectionForSortKey(110)).toBe("jungenbund");
    expect(sectionForSortKey(190)).toBe("jungenbund");
    expect(sectionForSortKey(210)).toBe("jungenbund");
    expect(sectionForSortKey(230)).toBe("jungenbund");
  });
  it("maps 220/240 to maedchenbund and 3xx to bund", () => {
    expect(sectionForSortKey(220)).toBe("maedchenbund");
    expect(sectionForSortKey(240)).toBe("maedchenbund");
    expect(sectionForSortKey(300)).toBe("bund");
    expect(sectionForSortKey(310)).toBe("bund");
  });
  it("returns null for unmapped ranges", () => {
    expect(sectionForSortKey(250)).toBeNull();
    expect(sectionForSortKey(900)).toBeNull();
  });
});

describe("normalizeAelterengemeinschaft", () => {
  it("maps the three known communities", () => {
    expect(normalizeAelterengemeinschaft("Orden St. Georg")?.section).toBe("orden_st_georg");
    expect(normalizeAelterengemeinschaft("Orden St. Christophorus")?.section).toBe(
      "orden_st_christophorus",
    );
    expect(normalizeAelterengemeinschaft("Bundesgilde")?.section).toBe("bundesgilde");
  });
  it("tolerates spacing and typo variants", () => {
    expect(normalizeAelterengemeinschaft("Orden St.Georg")?.name).toBe("Orden St. Georg");
    expect(normalizeAelterengemeinschaft("Orden St. Christophprus")?.section).toBe(
      "orden_st_christophorus",
    );
  });
  it("returns null for empty or unknown values", () => {
    expect(normalizeAelterengemeinschaft("")).toBeNull();
    expect(normalizeAelterengemeinschaft("Unbekannt")).toBeNull();
  });
});

describe("splitOffices", () => {
  it("splits on comma, trims, and drops empties", () => {
    expect(splitOffices("Amt Eins, Amt Zwei ,, Amt Drei")).toEqual([
      "Amt Eins",
      "Amt Zwei",
      "Amt Drei",
    ]);
    expect(splitOffices("")).toEqual([]);
    expect(splitOffices("Einzelamt")).toEqual(["Einzelamt"]);
  });
});

describe("rankForOffice", () => {
  it("ranks the leadership tier at 10", () => {
    expect(rankForOffice("Musterschaftsführer")).toBe(10);
    expect(rankForOffice("Musterschaftsführerin")).toBe(10);
    expect(rankForOffice("Beispielvogt")).toBe(10);
    expect(rankForOffice("Beispielvögtin")).toBe(10);
    expect(rankForOffice("Landesvorsitzende")).toBe(10);
  });
  it("ranks kanzler/kämmerer/obmann tiers", () => {
    expect(rankForOffice("Musterkanzler")).toBe(20);
    expect(rankForOffice("Musterkämmerer")).toBe(30);
    expect(rankForOffice("Musterkämmerin")).toBe(30);
    expect(rankForOffice("Obmann des Beispielrates")).toBe(40);
    expect(rankForOffice("Obfrau des Beispielrates")).toBe(40);
  });
  it("distinguishes beisitzer from ersatzbeisitzer", () => {
    expect(rankForOffice("Beisitzer")).toBe(50);
    expect(rankForOffice("Beisitzerin")).toBe(50);
    expect(rankForOffice("Ersatzbeisitzer")).toBe(60);
    expect(rankForOffice("Ersatzbeisitzerin")).toBe(60);
  });
  it("falls back to 999 for unknown offices", () => {
    expect(rankForOffice("Musikbeauftragte")).toBe(999);
    expect(rankForOffice("Herold")).toBe(999);
  });
});

describe("buildPhones", () => {
  it("joins area code and number with a space and keeps the label", () => {
    expect(
      buildPhones([{ vorwahl: "0123", nummer: "456789", bezeichner: "Privat" }]),
    ).toEqual([{ label: "Privat", number: "0123 456789" }]);
  });
  it("canonicalises common free-text spellings but keeps unknown labels", () => {
    expect(
      buildPhones([
        { vorwahl: "0123", nummer: "111", bezeichner: "mobil" },
        { vorwahl: "0123", nummer: "222", bezeichner: " PRIVAT " },
        { vorwahl: "0123", nummer: "333", bezeichner: "Büro" },
      ]),
    ).toEqual([
      { label: "Mobil", number: "0123 111" },
      { label: "Privat", number: "0123 222" },
      { label: "Büro", number: "0123 333" },
    ]);
  });
  it("skips entries without a number and falls back to the default label", () => {
    expect(
      buildPhones([
        { vorwahl: "", nummer: "", bezeichner: "Mobil" },
        { vorwahl: "", nummer: "555000", bezeichner: "" },
      ]),
    ).toEqual([{ label: "Telefon", number: "555000" }]);
  });
});

describe("parseBool", () => {
  it("treats 1/true/yes as true, everything else as false", () => {
    expect(parseBool("1")).toBe(true);
    expect(parseBool("True")).toBe(true);
    expect(parseBool("0")).toBe(false);
    expect(parseBool("")).toBe(false);
    expect(parseBool(undefined)).toBe(false);
  });
});

describe("parseDate", () => {
  it("extracts the ISO date part", () => {
    expect(parseDate("2019-06-24 00:00:00")).toBe("2019-06-24");
    expect(parseDate("2000-01-01")).toBe("2000-01-01");
  });
  it("returns null for empty/invalid", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("kein Datum")).toBeNull();
  });
  it("rejects impossible calendar dates (Access day-00 sentinel, Feb 30)", () => {
    expect(parseDate("1900-01-00 00:00:00")).toBeNull();
    expect(parseDate("2023-02-30")).toBeNull();
    expect(parseDate("2023-13-01")).toBeNull();
  });
});

describe("deriveKind", () => {
  it("recognises known group type prefixes", () => {
    expect(deriveKind("Gau Beispiel")).toBe("Gau");
    expect(deriveKind("Konvent Muster")).toBe("Konvent");
    expect(deriveKind("Mädelschaft Beispiel")).toBe("Mädelschaft");
  });
  it("returns null for unknown prefixes", () => {
    expect(deriveKind("Sonderrunde Muster")).toBeNull();
  });
});

describe("buildGroupChain", () => {
  it("collapses repeated names to a single node", () => {
    expect(buildGroupChain("Gau Muster", "Gau Muster", "Gau Muster")).toEqual(["Gau Muster"]);
  });
  it("keeps a three-level chain in order", () => {
    expect(buildGroupChain("Ring Muster", "Mädelschaft Beispiel", "Hag Probe")).toEqual([
      "Ring Muster",
      "Mädelschaft Beispiel",
      "Hag Probe",
    ]);
  });
  it("drops empties but keeps distinct leaf", () => {
    expect(buildGroupChain("Gau Muster", "", "Stamm Probe")).toEqual(["Gau Muster", "Stamm Probe"]);
  });
});

describe("resolveLegacyIds", () => {
  it("passes through unique ids unchanged", () => {
    const res = resolveLegacyIds([
      { id: "1", firstName: "Anna", lastName: "Muster", changedAt: "2020-01-01", order: 0 },
      { id: "2", firstName: "Bert", lastName: "Beispiel", changedAt: "2020-01-01", order: 1 },
    ]);
    expect(res).toEqual([
      { order: 0, legacyId: "1" },
      { order: 1, legacyId: "2" },
    ]);
  });

  it("collapses same-name conflict copies to the latest changedAt", () => {
    const res = resolveLegacyIds([
      { id: "5", firstName: "Cara", lastName: "Muster", changedAt: "2019-01-01", order: 0 },
      { id: "5", firstName: "Cara", lastName: "Muster", changedAt: "2021-05-05", order: 1 },
      { id: "5", firstName: "Cara", lastName: "Muster", changedAt: "2020-03-03", order: 2 },
    ]);
    expect(res).toEqual([{ order: 1, legacyId: "5" }]);
  });

  it("breaks a changedAt tie by taking the last row in file order", () => {
    const res = resolveLegacyIds([
      { id: "6", firstName: "Dana", lastName: "Muster", changedAt: "2020-01-01", order: 0 },
      { id: "6", firstName: "Dana", lastName: "Muster", changedAt: "2020-01-01", order: 3 },
    ]);
    expect(res).toEqual([{ order: 3, legacyId: "6" }]);
  });

  it("keeps different people sharing an id as separate persons with #n suffixes", () => {
    const res = resolveLegacyIds([
      { id: "9", firstName: "Emil", lastName: "Erste", changedAt: "2020-01-01", order: 0 },
      { id: "9", firstName: "Frida", lastName: "Zweite", changedAt: "2020-01-01", order: 1 },
    ]);
    expect(res).toEqual([
      { order: 0, legacyId: "9" },
      { order: 1, legacyId: "9#2" },
    ]);
  });

  it("is deterministic regardless of input order (suffix follows file order)", () => {
    const rows = [
      { id: "9", firstName: "Frida", lastName: "Zweite", changedAt: "2020-01-01", order: 5 },
      { id: "9", firstName: "Emil", lastName: "Erste", changedAt: "2020-01-01", order: 2 },
    ];
    const res = resolveLegacyIds(rows);
    // Emil appears first in file order (order 2) → bare id; Frida → #2
    expect(res).toContainEqual({ order: 2, legacyId: "9" });
    expect(res).toContainEqual({ order: 5, legacyId: "9#2" });
  });
});
