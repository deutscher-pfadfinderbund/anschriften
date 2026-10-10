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

/**
 * RFC-4180 field: quote when the value contains `"`, `;`, CR or LF; double inner quotes.
 * Values that a spreadsheet would evaluate as a formula get an apostrophe prefix so they are
 * rendered as text (CSV injection — person data is not trusted input): a leading =, + or @,
 * and a leading `-` directly followed by another character (`-1+1`, `-HYPERLINK(…)`). A dash
 * followed by a space ("- kein Briefkasten") or standing alone is a legitimate value and stays
 * untouched (issue #13).
 */
function csvField(value: string | null | undefined): string {
  let s = (value ?? "").trim();
  if (/^(?:[=+@]|-(?=\S))/.test(s)) s = `'${s}`;
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

/**
 * One plausible e-mail address: no whitespace, exactly one @, a dot in the domain. The single
 * rule for the person form, the BCC copy/preview and the actual mail send. The legacy column is
 * free text, so entries like "a@x.de, b@y.de" or notes exist and must not pass.
 */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when `value` (trimmed) is one plausible e-mail address. */
export function isEmail(value: string | null | undefined): boolean {
  return EMAIL_RE.test((value ?? "").trim());
}

type CollectedEmails = {
  /** Trimmed, valid addresses, deduplicated case-insensitively, in first-seen order. */
  recipients: string[];
  /** How many inputs were dropped because they were blank or not a valid address. */
  skipped: number;
};

/**
 * Turn raw person e-mails (some null/blank/malformed, possibly duplicated) into the actual
 * recipient set. Used for the clipboard BCC, the compose preview AND the real send, so the
 * count the user confirms is the count that goes out.
 */
export function collectEmails(emails: (string | null | undefined)[]): CollectedEmails {
  const seen = new Set<string>();
  const recipients: string[] = [];
  let skipped = 0;
  for (const raw of emails) {
    const e = (raw ?? "").trim();
    if (!EMAIL_RE.test(e)) {
      skipped += 1;
      continue;
    }
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(e);
  }
  return { recipients, skipped };
}

/** Separator flavour for the copied BCC list: Outlook/Thunderbird want `; `, Gmail wants `, `. */
export type BccSeparator = "; " | ", ";

export type BccResult = {
  /** The joined, deduplicated address string. */
  text: string;
  /** How many distinct addresses ended up in the list. */
  count: number;
  /** How many members were skipped because they have no (valid) e-mail address. */
  skipped: number;
};

/** `collectEmails` joined with the chosen separator, ready for the clipboard / BCC field. */
export function buildBcc(
  emails: (string | null | undefined)[],
  separator: BccSeparator,
): BccResult {
  const { recipients, skipped } = collectEmails(emails);
  return { text: recipients.join(separator), count: recipients.length, skipped };
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
