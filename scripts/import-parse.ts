// Pure parsing/mapping helpers for the Access import (issue #2).
// Kept free of DB and I/O so they can be unit-tested with fictitious data.

export type Section =
  | "bund"
  | "jungenbund"
  | "maedchenbund"
  | "orden_st_georg"
  | "orden_st_christophorus"
  | "bundesgilde";

/** The 7 mailing lists derived from the old Bool flags, mapped to their Access column name. */
export const DISTRIBUTION_LISTS: { name: string; column: string }[] = [
  { name: "Bundesthing", column: "Bundesthing" },
  { name: "Bundesrat", column: "Bundesrat" },
  { name: "Bundesjungenrat", column: "Bundesjungenrat" },
  { name: "Bundesmädchenrat", column: "Bundesmädchenrat" },
  { name: "Protokoll Bundesthing", column: "Protokoll Bundesthing" },
  { name: "Protokoll Bundesrat", column: "Protokoll Bundesrat" },
  { name: "NRW", column: "NRW" },
];

/** Parse the Access `Hilfsgruppe` value "NNN Name" into a numeric sort key and clean name. */
export function parseHilfsgruppe(value: string): { sortKey: number; name: string } | null {
  const m = value.trim().match(/^(\d+)\s+(.*\S)\s*$/);
  if (!m) return null;
  return { sortKey: parseInt(m[1], 10), name: m[2].trim() };
}

/**
 * Map the numeric Hilfsgruppe key to a section.
 * 0xx → bund (except 030 → jungenbund, 040 → maedchenbund); 1xx/210/230 → jungenbund;
 * 220/240 → maedchenbund; 3xx → bund. Returns null for unmapped ranges (caller logs).
 */
export function sectionForSortKey(n: number): Section | null {
  if (n === 30) return "jungenbund";
  if (n === 40) return "maedchenbund";
  if (n > 0 && n < 100) return "bund";
  if (n >= 100 && n < 200) return "jungenbund";
  if (n === 210 || n === 230) return "jungenbund";
  if (n === 220 || n === 240) return "maedchenbund";
  if (n >= 300 && n < 400) return "bund";
  return null;
}

/** Normalise an Älterengemeinschaft value (incl. known typos) into section + canonical name. */
export function normalizeAelterengemeinschaft(
  value: string,
): { section: Section; name: string; kind: string } | null {
  const key = value.toLowerCase().replace(/[.\s]/g, "");
  if (!key) return null;
  if (key.includes("georg")) return { section: "orden_st_georg", name: "Orden St. Georg", kind: "Orden" };
  if (key.includes("christoph"))
    return { section: "orden_st_christophorus", name: "Orden St. Christophorus", kind: "Orden" };
  if (key.includes("gilde")) return { section: "bundesgilde", name: "Bundesgilde", kind: "Gilde" };
  return null;
}

/** Split a comma-separated office free-text field into trimmed, non-empty tokens. */
export function splitOffices(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Rank an office name for PDF ordering via case-insensitive substring matching.
 * Order matters: the more specific "ersatzbeisitzer" wins over "beisitzer".
 * Unknown offices return 999 (caller logs them for manual cleanup).
 */
export function rankForOffice(name: string): number {
  const s = name.toLowerCase();
  if (s.includes("ersatzbeisitzer")) return 60;
  if (s.includes("beisitzer")) return 50;
  if (s.includes("obmann") || s.includes("obfrau")) return 40;
  if (s.includes("kämmer")) return 30;
  if (s.includes("kanzler")) return 20;
  if (
    s.includes("vogt") ||
    s.includes("vögt") ||
    s.includes("führer") ||
    s.includes("vorsitzende")
  )
    return 10;
  return 999;
}

/** True if a rank lookup produced the fallback (unknown) rank. */
export function isUnknownRank(rank: number): boolean {
  return rank === 999;
}

export interface PhoneInput {
  vorwahl: string;
  nummer: string;
  bezeichner: string;
}

/** Build the phones jsonb array: join area code + number with a space, drop empties, label fallback "Telefon". */
export function buildPhones(inputs: PhoneInput[]): { label: string; number: string }[] {
  const phones: { label: string; number: string }[] = [];
  for (const { vorwahl, nummer, bezeichner } of inputs) {
    const number = [vorwahl, nummer]
      .map((p) => (p ?? "").trim())
      .filter((p) => p.length > 0)
      .join(" ");
    if (!number) continue;
    const label = (bezeichner ?? "").trim() || "Telefon";
    phones.push({ label, number });
  }
  return phones;
}

/** Access exports booleans as "0"/"1"; be lenient about other truthy spellings too. */
export function parseBool(value: string | undefined): boolean {
  const s = (value ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "-1";
}

/**
 * Take the ISO date part of an Access datetime export ("2019-06-24 00:00:00" → "2019-06-24").
 * Rejects impossible calendar dates such as the Access "day 00" sentinel (e.g. "1900-01-00").
 */
export function parseDate(value: string | undefined): string | null {
  const m = (value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, ys, ms, ds] = m;
  const y = Number(ys);
  const mo = Number(ms);
  const d = Number(ds);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${ys}-${ms}-${ds}`;
}

const KNOWN_KINDS = [
  "Aufbaustamm",
  "Aufbauhag",
  "Aufbau-Hag",
  "Aufbaukollegium",
  "Jungenschaft",
  "Mädelschaft",
  "Landesamt",
  "Kollegium",
  "Konvent",
  "Stamm",
  "Trupp",
  "Gilde",
  "Gau",
  "Ring",
  "Hag",
];

/** Best-effort `kind` (Gau/Stamm/Konvent…) from the first token of a group name; null if unknown. */
export function deriveKind(name: string): string | null {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const hit = KNOWN_KINDS.find((k) => k.toLowerCase() === first.toLowerCase());
  return hit ?? null;
}

/** Ordered, de-duplicated group name chain (top → middle → leaf); empties and repeats removed. */
export function buildGroupChain(...names: (string | null | undefined)[]): string[] {
  const chain: string[] = [];
  for (const raw of names) {
    const v = (raw ?? "").trim();
    if (v && !chain.includes(v)) chain.push(v);
  }
  return chain;
}

export interface DedupInput {
  id: string;
  firstName: string;
  lastName: string;
  changedAt: string;
  order: number;
}

export interface DedupResult {
  order: number;
  legacyId: string;
}

/**
 * Resolve stable legacy_ids for rows exported from the sync-conflicted Access file.
 * Rows are keyed on the Access ID. Within a colliding ID, rows are grouped by
 * (firstName, lastName): each name-group is one person and collapses to the row with the
 * latest `changedAt` (tie → last in file order) — these are Nextcloud conflict copies.
 * Genuinely different people sharing an ID (autonumber collisions) are kept as separate
 * persons via a deterministic "#n" suffix so no human is dropped. Deterministic across runs.
 */
export function resolveLegacyIds(rows: DedupInput[]): DedupResult[] {
  const byId = new Map<string, DedupInput[]>();
  for (const r of rows) {
    if (!byId.has(r.id)) byId.set(r.id, []);
    byId.get(r.id)!.push(r);
  }

  const nameKey = (r: DedupInput) =>
    `${r.firstName.trim().toLowerCase()}|${r.lastName.trim().toLowerCase()}`;
  const minOrder = (rs: DedupInput[]) => Math.min(...rs.map((r) => r.order));
  const pickLatest = (rs: DedupInput[]) =>
    rs.reduce((best, r) =>
      r.changedAt > best.changedAt || (r.changedAt === best.changedAt && r.order > best.order)
        ? r
        : best,
    );

  const out: DedupResult[] = [];
  for (const [id, group] of byId) {
    if (group.length === 1) {
      out.push({ order: group[0].order, legacyId: id });
      continue;
    }
    const byName = new Map<string, DedupInput[]>();
    for (const r of group) {
      const k = nameKey(r);
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k)!.push(r);
    }
    const subgroups = [...byName.values()].sort((a, b) => minOrder(a) - minOrder(b));
    subgroups.forEach((sg, i) => {
      const winner = pickLatest(sg);
      out.push({ order: winner.order, legacyId: i === 0 ? id : `${id}#${i + 1}` });
    });
  }
  return out;
}
