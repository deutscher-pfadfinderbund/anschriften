// Pure display + search helpers. No DB, safe on the client.

/** Accent/umlaut-insensitive fold for search (Müller ↔ muller, Weiß ↔ weiss). */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
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

/** German date + time for the "zuletzt geändert" meta line. */
export function formatDateTime(value?: string | Date | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Salutation options for the editor. Empty string = keine Anrede. */
export const SALUTATIONS = ["Herr", "Frau"] as const;

/** Phone label options for the dynamic phone list. */
export const PHONE_LABELS = ["mobil", "privat", "dienstlich", "Telefon"] as const;

/** Human-readable label for a group section (for tree headers / hints). */
export const SECTION_LABELS: Record<string, string> = {
  bund: "Bund",
  jungenbund: "Jungenbund",
  maedchenbund: "Mädchenbund",
  orden_st_georg: "Orden St. Georg",
  orden_st_christophorus: "Orden St. Christophorus",
  bundesgilde: "Bundesgilde",
};

export const SECTION_ORDER = [
  "bund",
  "jungenbund",
  "maedchenbund",
  "orden_st_georg",
  "orden_st_christophorus",
  "bundesgilde",
] as const;
