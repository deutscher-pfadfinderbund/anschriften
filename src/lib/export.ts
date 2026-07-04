// Pure export helpers for the distribution-list features (issue #4).
// No DB, no React — safe to import on both the client (BCC copy) and server (CSV route).

/** Column order for the CSV export, matching the old Access serial-letter query. */
export const CSV_COLUMNS = [
  "Anrede",
  "Titel",
  "Vorname",
  "Nachname",
  "Fahrtenname",
  "Straße",
  "Zusatz",
  "PLZ",
  "Ort",
  "E-Mail",
] as const;

/** One person as needed for the CSV export (raw address fields, no formatting). */
export type CsvPerson = {
  salutation: string | null;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  scoutName: string | null;
  street: string | null;
  addressExtra: string | null;
  postalCode: string | null;
  city: string | null;
  email: string | null;
};

/** RFC-4180 field: quote only when the value contains `"`, `;`, CR or LF; double inner quotes. */
function csvField(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Build the CSV body: header row plus one row per person, semicolon-separated,
 * CRLF line endings (so German Excel/Word open it directly). No BOM here — the
 * route prepends it so this stays a pure string helper.
 */
export function buildCsv(rows: CsvPerson[]): string {
  const lines = [CSV_COLUMNS.join(";")];
  for (const r of rows) {
    lines.push(
      [
        r.salutation,
        r.title,
        r.firstName,
        r.lastName,
        r.scoutName,
        r.street,
        r.addressExtra,
        r.postalCode,
        r.city,
        r.email,
      ]
        .map(csvField)
        .join(";"),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/** BOM so a byte-level check (`xxd | head -1` → efbbbf) and German Excel both see UTF-8. */
export const CSV_BOM = "﻿";

/** Separator flavour for the copied BCC list: Outlook/Thunderbird want `; `, Gmail wants `, `. */
export type BccSeparator = "; " | ", ";

export type BccResult = {
  /** The joined, deduplicated address string. */
  text: string;
  /** How many distinct addresses ended up in the list. */
  count: number;
  /** How many members were skipped because they have no e-mail address. */
  skipped: number;
};

/**
 * Turn a list of member e-mails (some may be null) into a BCC-ready string:
 * empties are counted as skipped, duplicates are collapsed case-insensitively,
 * and the rest are joined with the chosen separator (order preserved).
 */
export function buildBcc(
  emails: (string | null | undefined)[],
  separator: BccSeparator,
): BccResult {
  const seen = new Set<string>();
  const out: string[] = [];
  let skipped = 0;
  for (const raw of emails) {
    const e = (raw ?? "").trim();
    if (!e) {
      skipped += 1;
      continue;
    }
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return { text: out.join(separator), count: out.length, skipped };
}

/** ASCII-safe slug for the download filename (umlauts folded, spaces → dashes). */
export function asciiSlug(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "export";
}
