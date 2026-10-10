// The change log's pure side: what a person looks like to the log, the diff between two
// such snapshots, and the German field labels. Values are formatted here, when an entry
// is written, into display-ready strings (names instead of ids, dd.mm.yyyy, "ja"/"nein"),
// so an entry stays true when an Amt is renamed later and the UI only prints it.
// No DB, safe on the client; the DB side is src/db/audit.ts.

import { NO_OFFICE, canonicalPhoneLabel, formatDate, nullIfEmpty, tenureRange } from "@/lib/format";

export type AuditAction = "created" | "updated" | "deleted";

/** What a new person's entry leads with and what a deletion's entry says (shown and searched). */
export const ACTION_LABEL: Partial<Record<AuditAction, string>> = {
  created: "Person angelegt",
  deleted: "Eine Person wurde gelöscht",
};

/**
 * Every logged field with its German label, in display order: the person's own fields,
 * then its tenures and its manual Verteiler. The keys are stored in `audit_log.changes`,
 * so renaming one orphans old entries (the UI then shows the bare key).
 */
export const AUDIT_FIELD_LABELS = {
  salutation: "Anrede",
  title: "Titel",
  firstName: "Vorname",
  lastName: "Nachname",
  scoutName: "Fahrtenname",
  rank: "Stand",
  birthDate: "Geburtsdatum",
  street: "Straße",
  addressExtra: "Anschriftenzusatz",
  postalCode: "PLZ",
  city: "Ort",
  email: "E-Mail",
  phones: "Telefon",
  notes: "Anmerkung",
  doNotPrint: "Nicht abdrucken",
  deathDate: "Sterbedatum",
  assignment: "Amt",
  history: "Früheres Amt",
  list: "Verteiler",
} as const;

type AuditField = keyof typeof AUDIT_FIELD_LABELS;

/** One changed value; null stands for "empty" (shown as "—"). */
export type AuditChange = { field: AuditField; from: string | null; to: string | null };

/** One tenure as the log compares it: ids for matching, names for the text. */
export type AuditTenure = {
  id: number;
  groupId: number;
  officeId: number | null;
  group: string;
  office: string | null;
  startDate: string | null;
  endDate: string | null;
  endUnknown: boolean;
};

/** A person as the log sees it: references resolved to names, nothing formatted yet. */
export type AuditSnapshot = {
  salutation: string | null;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  scoutName: string | null;
  /** Name of the Stand. */
  rank: string | null;
  birthDate: string | null;
  deathDate: string | null;
  street: string | null;
  addressExtra: string | null;
  postalCode: string | null;
  city: string | null;
  email: string | null;
  phones: { label: string; number: string }[];
  notes: string | null;
  doNotPrint: boolean;
  /** Active and ended tenures. */
  tenures: AuditTenure[];
  /** Names of the Verteiler the person is a MANUAL member of. */
  lists: string[];
};

/** A person with nothing filled in: what a new person is compared against. */
const EMPTY: AuditSnapshot = {
  salutation: null,
  title: null,
  firstName: null,
  lastName: null,
  scoutName: null,
  rank: null,
  birthDate: null,
  deathDate: null,
  street: null,
  addressExtra: null,
  postalCode: null,
  city: null,
  email: null,
  phones: [],
  notes: null,
  doNotPrint: false,
  tenures: [],
  lists: [],
};

type ScalarField = Exclude<AuditField, "assignment" | "history" | "list">;

const date = (v: string | null) => formatDate(v) || null;

/**
 * "Mobil 0170 1234567; Privat 0251 123456" (a number without a label stands alone).
 * Labels in their curated spelling, as the editor shows them: the editor saves an imported
 * "mobil" as "Mobil", which is no change worth logging.
 */
export function formatPhones(phones: AuditSnapshot["phones"]): string | null {
  const parts = phones.map((p) => {
    const label = canonicalPhoneLabel(p.label);
    return label ? `${label} ${p.number}` : p.number;
  });
  return parts.join("; ") || null;
}

/** The person's own fields as display strings, in AUDIT_FIELD_LABELS order. */
function scalarValues(s: AuditSnapshot): Record<ScalarField, string | null> {
  return {
    salutation: nullIfEmpty(s.salutation),
    title: nullIfEmpty(s.title),
    firstName: nullIfEmpty(s.firstName),
    lastName: nullIfEmpty(s.lastName),
    scoutName: nullIfEmpty(s.scoutName),
    rank: nullIfEmpty(s.rank),
    birthDate: date(s.birthDate),
    street: nullIfEmpty(s.street),
    addressExtra: nullIfEmpty(s.addressExtra),
    postalCode: nullIfEmpty(s.postalCode),
    city: nullIfEmpty(s.city),
    email: nullIfEmpty(s.email),
    phones: formatPhones(s.phones),
    notes: nullIfEmpty(s.notes),
    doNotPrint: s.doNotPrint ? "ja" : "nein",
    deathDate: date(s.deathDate),
  };
}

/** "Bundeskanzler · Bundeskanzlei, seit 01.01.2020" — "Ohne Amt · …" for a plain membership. */
function tenureLabel(t: AuditTenure): string {
  const name = `${t.office ?? NO_OFFICE} · ${t.group}`;
  const range = tenureRange(t);
  return range ? `${name}, ${range}` : name;
}

/** What an active tenure became when it was ended: "beendet am 31.12.2025". */
function endedLabel(t: AuditTenure): string {
  return t.endUnknown ? "beendet, Ende unbekannt" : `beendet am ${formatDate(t.endDate)}`;
}

const isActive = (t: AuditTenure) => t.endDate == null;
/** Active rows are recreated on every save (new ids), so they match by Gliederung + Amt —
 *  unique among active rows (partial unique index). */
const comboKey = (t: AuditTenure) => `${t.groupId}:${t.officeId ?? "-"}`;

/**
 * Tenure changes: active rows ("Amt") added, removed, re-dated or ended; history rows
 * ("Früheres Amt") added, edited or deleted. History rows keep their ids; an ended row
 * that is new to the history and whose combination was active before is that active row
 * being ended.
 */
function diffTenures(before: AuditTenure[], after: AuditTenure[]): AuditChange[] {
  const active: AuditChange[] = [];
  const history: AuditChange[] = [];

  const wasActive = new Map(before.filter(isActive).map((t) => [comboKey(t), t]));
  const wasEnded = new Map(before.filter((t) => !isActive(t)).map((t) => [t.id, t]));

  const added: AuditChange[] = [];
  for (const t of after.filter(isActive)) {
    const old = wasActive.get(comboKey(t));
    if (!old) {
      added.push({ field: "assignment", from: null, to: tenureLabel(t) });
      continue;
    }
    wasActive.delete(comboKey(t));
    if (tenureLabel(old) !== tenureLabel(t)) active.push({ field: "assignment", from: tenureLabel(old), to: tenureLabel(t) });
  }

  for (const t of after.filter((t) => !isActive(t))) {
    const old = wasEnded.get(t.id);
    if (old) {
      wasEnded.delete(t.id);
      if (tenureLabel(old) !== tenureLabel(t)) history.push({ field: "history", from: tenureLabel(old), to: tenureLabel(t) });
      continue;
    }
    const ended = wasActive.get(comboKey(t));
    if (ended) {
      wasActive.delete(comboKey(t));
      active.push({ field: "assignment", from: tenureLabel(ended), to: endedLabel(t) });
    } else history.push({ field: "history", from: null, to: tenureLabel(t) });
  }

  for (const old of wasActive.values()) active.push({ field: "assignment", from: tenureLabel(old), to: null });
  for (const old of wasEnded.values()) history.push({ field: "history", from: tenureLabel(old), to: null });
  return [...active, ...added, ...history];
}

/** The change of one manual Verteiler membership. */
export function listChange(listName: string, added: boolean): AuditChange {
  return { field: "list", from: added ? null : listName, to: added ? listName : null };
}

/**
 * Everything that differs between two snapshots of one person, in display order. A new
 * person (`before` null) is compared against an empty one, so its entry lists every value
 * it was created with.
 */
export function diffSnapshots(before: AuditSnapshot | null, after: AuditSnapshot): AuditChange[] {
  const old = before ?? EMPTY;
  const was = scalarValues(old);
  const now = scalarValues(after);
  const scalars = (Object.keys(now) as ScalarField[]).flatMap((field) =>
    was[field] === now[field] ? [] : [{ field, from: was[field], to: now[field] }],
  );
  const lists = [
    ...old.lists.filter((l) => !after.lists.includes(l)).map((l) => listChange(l, false)),
    ...after.lists.filter((l) => !old.lists.includes(l)).map((l) => listChange(l, true)),
  ];
  return [...scalars, ...diffTenures(old.tenures, after.tenures), ...lists];
}

/** The German label of a stored field key (an unknown, e.g. retired, key shows as is). */
export function auditFieldLabel(field: string): string {
  return (AUDIT_FIELD_LABELS as Record<string, string>)[field] ?? field;
}
