import { describe, expect, it } from "vitest";

import {
  asciiSlug,
  buildBcc,
  buildCsv,
  collectEmails,
  CSV_COLUMNS,
  EMAIL_RE,
  isEmail,
  type CsvPerson,
} from "./export";

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

  it("neutralizes dangerous formula starters but leaves legitimate values intact (CSV injection)", () => {
    const csv = buildCsv([
      {
        ...emptyPerson,
        firstName: "=1+1",
        lastName: "@SUM(A1)",
        scoutName: "+49",
        addressExtra: "- kein Briefkasten",
      },
    ]);
    const row = csv.split("\r\n")[1];
    expect(row).toContain("'=1+1");
    expect(row).toContain("'@SUM(A1)");
    expect(row).toContain("'+49");
    // A dash followed by a space is a legitimate value and survives untouched (issue #13).
    expect(row).toContain("- kein Briefkasten");
    expect(row).not.toContain("'- kein Briefkasten");
    expect(row).not.toMatch(/(^|;)=/);
  });

  it("guards a leading dash directly followed by a character (Excel evaluates -1+1)", () => {
    const csv = buildCsv([
      { ...emptyPerson, firstName: "-1+1", lastName: "-HYPERLINK(\"x\")", city: "-foo", street: "-" },
    ]);
    const row = csv.split("\r\n")[1];
    expect(row).toContain("'-1+1");
    expect(row).toContain("'-HYPERLINK");
    expect(row).toContain("'-foo");
    // A lone dash (placeholder in legacy data) is not a formula and stays as it is.
    expect(row).toContain(";-;");
  });
});

describe("collectEmails / EMAIL_RE", () => {
  it("trims, drops blanks (counted), dedupes case-insensitively, keeps order", () => {
    const res = collectEmails(["A@example.org", " b@example.org ", "", null, "a@example.org", undefined]);
    expect(res.recipients).toEqual(["A@example.org", "b@example.org"]);
    expect(res.skipped).toBe(3);
  });

  it("handles an all-empty input", () => {
    expect(collectEmails([null, "", "  "])).toEqual({ recipients: [], skipped: 3 });
  });

  it("skips malformed legacy values instead of passing them on", () => {
    const res = collectEmails([
      "a@x.de, b@y.de", // legacy double-address in one field
      "kein-at-zeichen",
      "leerzeichen @x.de",
      "ok@example.org",
    ]);
    expect(res.recipients).toEqual(["ok@example.org"]);
    expect(res.skipped).toBe(3);
  });

  it("exposes the same rule as EMAIL_RE / isEmail", () => {
    expect(EMAIL_RE.test("ok@example.org")).toBe(true);
    expect(isEmail(" ok@example.org ")).toBe(true);
    expect(isEmail("a@x.de, b@y.de")).toBe(false);
    expect(isEmail(null)).toBe(false);
  });
});

describe("buildBcc", () => {
  it("counts malformed entries as skipped, so preview, copy and send agree", () => {
    const res = buildBcc(["ok@example.org", "a@x.de, b@y.de", "siehe Notiz"], "; ");
    expect(res).toEqual({ text: "ok@example.org", count: 1, skipped: 2 });
  });

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
