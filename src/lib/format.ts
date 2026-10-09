// Pure display + search helpers. No DB, safe on the client.

/**
 * Canonical German collation fold (DIN 5007-2, phone-book): compose first, then map
 * ä→ae, ö→oe, ü→ue, ß→ss, strip any remaining accents (café → cafe) and lower-case.
 * The one collation rule for the app: the persons table and the printed PDF register
 * (src/pdf/build-data.ts) both sort with it, so they cannot drift apart.
 */
export function fold(s: string): string {
  return s
    .normalize("NFC")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** "Nachname, Vorname" with sensible fallbacks to the scout name. */
export function formatName(p: {
  firstName?: string | null;
  lastName?: string | null;
  scoutName?: string | null;
}): string {
  const last = p.lastName?.trim() ?? "";
  const first = p.firstName?.trim() ?? "";
  if (last && first) return `${last}, ${first}`;
  if (last) return last;
  if (first) return first;
  return p.scoutName?.trim() || "—";
}

/**
 * The Fahrtenname as an addition to a real name: returned only when there is a Vor- or
 * Nachname next to it (a person known only by the scout name already shows it as the
 * name itself, see `formatName`). Null otherwise.
 */
export function scoutAddition(p: {
  firstName?: string | null;
  lastName?: string | null;
  scoutName?: string | null;
}): string | null {
  const scout = p.scoutName?.trim();
  if (!scout) return null;
  return p.lastName?.trim() || p.firstName?.trim() ? scout : null;
}

/** "Nachname, Vorname „Fahrtenname“" — the plain-text form for headings, options and lists. */
export function formatNameWithScout(p: {
  firstName?: string | null;
  lastName?: string | null;
  scoutName?: string | null;
}): string {
  const scout = scoutAddition(p);
  return scout ? `${formatName(p)} „${scout}“` : formatName(p);
}

/** German date for display: "24.06.2019". Input is an ISO date string or null. */
export function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** Year part of an ISO date, or null. */
export function birthYear(iso?: string | null): number | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

// The Bund works in German time. Both helpers below pin Europe/Berlin explicitly: the
// server (container) runs in UTC, the browser in the user's zone, and an unpinned
// "today"/time would differ between them (wrong dates after midnight, hydration errors).
const BERLIN = "Europe/Berlin";

const berlinDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: BERLIN,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's calendar date in Europe/Berlin as ISO `YYYY-MM-DD`. Same result on server and client. */
export function todayIso(now: Date = new Date()): string {
  const parts = berlinDate.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** German date + time in Europe/Berlin, e.g. "09.10.2026, 18:49" (the "zuletzt geändert" line). */
export function formatDateTime(value?: string | Date | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE", {
    timeZone: BERLIN,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Salutation options for the editor. Empty string = keine Anrede. */
export const SALUTATIONS = ["Herr", "Frau"] as const;

/** Curated phone label options for the dynamic phone list. */
export const PHONE_LABELS = ["Mobil", "Privat", "Dienstlich", "Telefon"] as const;

/**
 * Map a stored, free-text phone label onto the curated spelling.
 *
 * The Access column `bezeichner` is free text, so imported labels arrive as "mobil",
 * " Privat " or something entirely different ("Büro", "Handy"). Anything that matches a
 * curated label after trimming and folding (case + umlauts) becomes that label; anything
 * else is returned trimmed but otherwise untouched, so no stored value is ever lost.
 * An empty/missing label stays the empty string.
 */
export function canonicalPhoneLabel(raw?: string | null): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  const key = fold(trimmed);
  return PHONE_LABELS.find((l) => fold(l) === key) ?? trimmed;
}

/**
 * Select options for one phone row. A Radix Select whose value matches no item renders
 * blank, so a label outside the curated list is appended as its own option — the user
 * sees exactly what is stored and can keep or replace it.
 */
export function phoneLabelOptions(current?: string | null): string[] {
  const label = canonicalPhoneLabel(current);
  const curated: string[] = [...PHONE_LABELS];
  if (!label || curated.includes(label)) return curated;
  return [...curated, label];
}
