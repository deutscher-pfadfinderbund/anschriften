import { describe, expect, it } from "vitest";

import { auditFieldLabel, diffSnapshots, type AuditSnapshot, type AuditTenure } from "./audit";

// All test data below is fictitious.

const person = (patch: Partial<AuditSnapshot> = {}): AuditSnapshot => ({
  salutation: "Frau",
  title: null,
  firstName: "Anna",
  lastName: "Muster",
  scoutName: null,
  rank: "Späherin",
  birthDate: "1990-05-01",
  deathDate: null,
  street: "Lindenweg 3",
  addressExtra: null,
  postalCode: "48143",
  city: "Münster",
  email: null,
  phones: [],
  notes: null,
  doNotPrint: false,
  tenures: [],
  lists: [],
  ...patch,
});

const tenure = (patch: Partial<AuditTenure> = {}): AuditTenure => ({
  id: 1,
  groupId: 10,
  officeId: 20,
  group: "Bundeskanzlei",
  office: "Kanzlerin",
  startDate: "2020-01-01",
  endDate: null,
  endUnknown: false,
  ...patch,
});

describe("diffSnapshots: the person's own fields", () => {
  it("lists only what changed, as display strings", () => {
    const before = person({ phones: [{ label: "Mobil", number: "0170 1" }] });
    const after = person({
      city: "Köln",
      birthDate: "1990-05-02",
      phones: [
        { label: "Mobil", number: "0170 1" },
        { label: "Privat", number: "0221 2" },
      ],
      doNotPrint: true,
    });
    expect(diffSnapshots(before, after)).toEqual([
      { field: "birthDate", from: "01.05.1990", to: "02.05.1990" },
      { field: "city", from: "Münster", to: "Köln" },
      { field: "phones", from: "Mobil 0170 1", to: "Mobil 0170 1; Privat 0221 2" },
      { field: "doNotPrint", from: "nein", to: "ja" },
    ]);
  });

  it("is empty when nothing changed", () => {
    expect(diffSnapshots(person(), person())).toEqual([]);
  });

  it("treats blank and missing as the same empty value", () => {
    expect(diffSnapshots(person({ title: null }), person({ title: "  " }))).toEqual([]);
    expect(diffSnapshots(person({ title: "Dr." }), person({ title: null }))).toEqual([
      { field: "title", from: "Dr.", to: null },
    ]);
  });

  it("logs a Stand by its name", () => {
    expect(diffSnapshots(person(), person({ rank: "Gildin" }))).toEqual([
      { field: "rank", from: "Späherin", to: "Gildin" },
    ]);
  });

  it("does not log a save re-spelling a stored phone label the curated way", () => {
    const stored = person({ phones: [{ label: "mobil", number: "0170 1" }] });
    expect(diffSnapshots(stored, person({ phones: [{ label: "Mobil", number: "0170 1" }] }))).toEqual([]);
  });
});

describe("diffSnapshots: a new person", () => {
  it("lists every value it was created with, nothing for the empty ones", () => {
    const created = person({
      tenures: [tenure(), tenure({ id: 2, officeId: null, office: null, startDate: null, endDate: "2019-12-31" })],
      lists: ["Bundesrat"],
    });
    expect(diffSnapshots(null, created)).toEqual([
      { field: "salutation", from: null, to: "Frau" },
      { field: "firstName", from: null, to: "Anna" },
      { field: "lastName", from: null, to: "Muster" },
      { field: "rank", from: null, to: "Späherin" },
      { field: "birthDate", from: null, to: "01.05.1990" },
      { field: "street", from: null, to: "Lindenweg 3" },
      { field: "postalCode", from: null, to: "48143" },
      { field: "city", from: null, to: "Münster" },
      { field: "assignment", from: null, to: "Kanzlerin · Bundeskanzlei, seit 01.01.2020" },
      { field: "history", from: null, to: "Ohne Amt · Bundeskanzlei, bis 31.12.2019" },
      { field: "list", from: null, to: "Bundesrat" },
    ]);
  });
});

describe("diffSnapshots: tenures", () => {
  it("matches active rows by Gliederung + Amt, not by id (savePerson recreates them)", () => {
    const before = person({ tenures: [tenure({ id: 1 })] });
    expect(diffSnapshots(before, person({ tenures: [tenure({ id: 7 })] }))).toEqual([]);
    expect(diffSnapshots(before, person({ tenures: [tenure({ id: 7, startDate: "2021-03-01" })] }))).toEqual([
      {
        field: "assignment",
        from: "Kanzlerin · Bundeskanzlei, seit 01.01.2020",
        to: "Kanzlerin · Bundeskanzlei, seit 01.03.2021",
      },
    ]);
  });

  it("logs added and removed active rows", () => {
    const kept = tenure({ id: 1 });
    const removed = tenure({ id: 2, officeId: 21, office: "Schatzmeisterin" });
    const added = tenure({ id: 3, groupId: 11, group: "Stamm Falken", officeId: null, office: null, startDate: null });
    expect(diffSnapshots(person({ tenures: [kept, removed] }), person({ tenures: [kept, added] }))).toEqual([
      { field: "assignment", from: "Schatzmeisterin · Bundeskanzlei, seit 01.01.2020", to: null },
      { field: "assignment", from: null, to: "Ohne Amt · Stamm Falken" },
    ]);
  });

  it("logs an ended active row as „beendet“ (recreated as history, or ended in place)", () => {
    const before = person({ tenures: [tenure({ id: 1 })] });
    const recreated = person({ tenures: [tenure({ id: 9, endDate: "2026-10-01" })] });
    const inPlace = person({ tenures: [tenure({ id: 1, endDate: "2026-10-10", endUnknown: true })] });
    expect(diffSnapshots(before, recreated)).toEqual([
      { field: "assignment", from: "Kanzlerin · Bundeskanzlei, seit 01.01.2020", to: "beendet am 01.10.2026" },
    ]);
    expect(diffSnapshots(before, inPlace)).toEqual([
      { field: "assignment", from: "Kanzlerin · Bundeskanzlei, seit 01.01.2020", to: "beendet, Ende unbekannt" },
    ]);
  });

  it("keeps an active row and logs a past tenure of the same combination as new history", () => {
    const before = person({ tenures: [tenure({ id: 1 })] });
    const after = person({
      tenures: [tenure({ id: 5 }), tenure({ id: 6, startDate: "2010-01-01", endDate: "2012-12-31" })],
    });
    expect(diffSnapshots(before, after)).toEqual([
      { field: "history", from: null, to: "Kanzlerin · Bundeskanzlei, 01.01.2010 – 31.12.2012" },
    ]);
  });

  it("logs history rows added, edited and deleted (they keep their ids)", () => {
    const old = tenure({ id: 4, startDate: null, endDate: "2015-06-30" });
    const gone = tenure({ id: 5, officeId: null, office: null, startDate: "2001-01-01", endDate: "2026-10-10", endUnknown: true });
    const before = person({ tenures: [old, gone] });
    const after = person({ tenures: [{ ...old, startDate: "2012-01-01" }] });
    expect(diffSnapshots(before, after)).toEqual([
      {
        field: "history",
        from: "Kanzlerin · Bundeskanzlei, bis 30.06.2015",
        to: "Kanzlerin · Bundeskanzlei, 01.01.2012 – 30.06.2015",
      },
      { field: "history", from: "Ohne Amt · Bundeskanzlei, 01.01.2001 – Ende unbekannt", to: null },
    ]);
  });
});

describe("diffSnapshots: manual Verteiler", () => {
  it("logs one change per list joined or left", () => {
    const before = person({ lists: ["Bundesrat", "Bundesthing"] });
    const after = person({ lists: ["Bundesthing", "Gildenrundbrief"] });
    expect(diffSnapshots(before, after)).toEqual([
      { field: "list", from: "Bundesrat", to: null },
      { field: "list", from: null, to: "Gildenrundbrief" },
    ]);
  });
});

describe("auditFieldLabel", () => {
  it("names a field in German, an unknown key as is", () => {
    expect(auditFieldLabel("city")).toBe("Ort");
    expect(auditFieldLabel("assignment")).toBe("Amt");
    expect(auditFieldLabel("retired")).toBe("retired");
  });
});
