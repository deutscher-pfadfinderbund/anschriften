import { describe, expect, it } from "vitest";

import { asciiSlug, buildBcc, buildCsv, CSV_COLUMNS, type CsvPerson } from "./export";

const emptyPerson: CsvPerson = {
  salutation: null,
  title: null,
  firstName: null,
  lastName: null,
  scoutName: null,
  street: null,
  addressExtra: null,
  postalCode: null,
  city: null,
  email: null,
};

describe("buildCsv", () => {
  it("emits the header row and CRLF line endings", () => {
    const csv = buildCsv([]);
    expect(csv).toBe(CSV_COLUMNS.join(";") + "\r\n");
  });

  it("keeps umlauts intact and orders columns correctly", () => {
    const csv = buildCsv([
      {
        ...emptyPerson,
        salutation: "Herr",
        firstName: "Jörg",
        lastName: "Müller",
        street: "Königsweg 3",
        postalCode: "90402",
        city: "Nürnberg",
        email: "joerg@example.org",
      },
    ]);
    const rows = csv.split("\r\n");
    expect(rows[1]).toBe("Herr;;Jörg;Müller;;Königsweg 3;;90402;Nürnberg;joerg@example.org");
  });

  it("quotes fields containing separators, quotes or newlines (RFC 4180)", () => {
    const csv = buildCsv([
      { ...emptyPerson, lastName: 'a;b', firstName: 'say "hi"', addressExtra: "line1\nline2" },
    ]);
    const row = csv.split("\r\n")[1];
    expect(row).toContain('"a;b"');
    expect(row).toContain('"say ""hi"""');
    expect(row).toContain('"line1\nline2"');
  });
});

describe("buildBcc", () => {
  it("dedupes case-insensitively, skips empties, joins with the separator", () => {
    const res = buildBcc(["A@x.de", "", null, "a@x.de", " b@x.de "], "; ");
    expect(res.text).toBe("A@x.de; b@x.de");
    expect(res.count).toBe(2);
    expect(res.skipped).toBe(2);
  });

  it("uses the comma separator for Gmail", () => {
    const res = buildBcc(["a@x.de", "b@x.de"], ", ");
    expect(res.text).toBe("a@x.de, b@x.de");
  });
});

describe("asciiSlug", () => {
  it("folds umlauts and collapses non-alphanumerics", () => {
    expect(asciiSlug("Bundesmädchenrat")).toBe("bundesmadchenrat");
    expect(asciiSlug("Protokoll Bundesthing")).toBe("protokoll-bundesthing");
    expect(asciiSlug("Weiß & Co.")).toBe("weiss-co");
  });

  it("falls back to a default for empty input", () => {
    expect(asciiSlug("„“ …")).toBe("export");
  });
});
