// The person editor's state as one plain object, plus the pure mappings around it:
// props → values, values → save payload, and the comparison behind the unsaved-changes
// guard. No React here, so it is unit-tested (form-values.test.ts).

import type { PersonEditData } from "@/db/queries";
import { canonicalPhoneLabel, formatDate, todayIso } from "@/lib/format";
import type { FieldErrors, PersonInput } from "@/lib/person-schema";

/** Select value for "nothing chosen" (Anrede, Stand): a Radix Select item cannot be "". */
export const NONE = "none";

/** Texts of the Gliederung and Amt pickers (rows and history dialog). */
export const GROUP_PICKER = {
  placeholder: "Gliederung wählen",
  searchPlaceholder: "Gliederung suchen …",
  emptyText: "Keine Gliederung gefunden.",
};
export const OFFICE_PICKER = {
  placeholder: "Kein Amt",
  searchPlaceholder: "Amt suchen …",
  emptyText: "Kein Amt gefunden.",
};

/** How a tenure ends: a date, or „Ende unbekannt“ (the server then records today). */
export type EndChoice = { endDate: string; endUnknown: boolean };

/**
 * Why an ending cannot be used, or null (also null while no date is entered yet). The
 * server checks the same rules on save; this only gives immediate feedback in a dialog.
 */
export function endChoiceError(end: EndChoice, start?: string | null, today = todayIso()): string | null {
  if (end.endUnknown || !end.endDate) return null;
  if (end.endDate > today) return "Das Bis-Datum darf nicht in der Zukunft liegen.";
  if (start && end.endDate < start) return `Das Bis-Datum darf nicht vor dem Beginn (${formatDate(start)}) liegen.`;
  return null;
}

/** A complete, valid ending: a date or „Ende unbekannt“. */
export function isEndChoiceReady(end: EndChoice, start?: string | null, today = todayIso()): boolean {
  return (end.endUnknown || !!end.endDate) && !endChoiceError(end, start, today);
}

export type PhoneRow = { key: string; label: string; number: string };

/** One "Ämter & Gliederungen" row. `key` is a stable React key; `id` the stored tenure. */
export type AssignmentRow = {
  key: string;
  /** Stored tenure id; null for a row added in this session (only stored rows can be ended). */
  id: number | null;
  groupId: number | null;
  officeId: number | null;
  startDate: string;
  /**
   * Buffered "Beenden": on save the row is written as a finished tenure (history).
   * `keepMember`: the person stays in the Gliederung, as a new row without the Amt.
   */
  end: (EndChoice & { keepMember?: boolean }) | null;
};

/** Buffered "end the current holder's tenure on save" (holder warning). */
export type EndPreviousOrder = EndChoice & { assignmentId: number };

export type FormValues = {
  salutation: string;
  title: string;
  firstName: string;
  lastName: string;
  scoutName: string;
  birthDate: string;
  deathDate: string;
  rankId: string;
  street: string;
  addressExtra: string;
  postalCode: string;
  city: string;
  email: string;
  notes: string;
  doNotPrint: boolean;
  phones: PhoneRow[];
  assignments: AssignmentRow[];
  /** Manual Verteiler memberships, ascending. */
  listIds: number[];
  endPrevious: EndPreviousOrder[];
};

/** Setter the panels get: replaces one value and clears the listed error keys (default: `key`). */
export type SetValue = <K extends keyof FormValues>(key: K, value: FormValues[K], clearErrors?: string[]) => void;

let seq = 0;
/** React key for a row added in the editor (stored rows use "p0", "a0", …). */
export function newKey(): string {
  seq += 1;
  return `n${seq}`;
}

/**
 * The form values for a stored person (or an empty form). Deterministic, so the editor can
 * recompute it from fresh props as the baseline of its dirty check.
 */
export function toFormValues(person?: PersonEditData): FormValues {
  return {
    salutation: person?.salutation ?? NONE,
    title: person?.title ?? "",
    firstName: person?.firstName ?? "",
    lastName: person?.lastName ?? "",
    scoutName: person?.scoutName ?? "",
    birthDate: person?.birthDate ?? "",
    deathDate: person?.deathDate ?? "",
    rankId: person?.rankId != null ? String(person.rankId) : NONE,
    street: person?.street ?? "",
    addressExtra: person?.addressExtra ?? "",
    postalCode: person?.postalCode ?? "",
    city: person?.city ?? "",
    email: person?.email ?? "",
    notes: person?.notes ?? "",
    doNotPrint: person?.doNotPrint ?? false,
    // Imported labels are free text ("mobil", " Privat "): canonicalise them on load so
    // the select shows the curated option; unknown labels ("Büro") survive verbatim.
    phones: (person?.phones ?? []).map((p, i) => ({
      key: `p${i}`,
      label: canonicalPhoneLabel(p.label),
      number: p.number,
    })),
    assignments: (person?.assignments ?? []).map((a, i) => ({
      key: `a${i}`,
      id: a.id,
      groupId: a.groupId,
      officeId: a.officeId,
      startDate: a.startDate ?? "",
      end: null,
    })),
    listIds: [...(person?.distributionListIds ?? [])].sort((x, y) => x - y),
    endPrevious: [],
  };
}

/**
 * Everything that counts as an edit, as a comparable string. Row keys and ids are
 * bookkeeping: removing a row and adding the same one back is no change.
 */
export function snapshot(v: FormValues): string {
  return JSON.stringify({
    ...v,
    phones: v.phones.map(({ label, number }) => ({ label, number })),
    assignments: v.assignments.map(({ groupId, officeId, startDate, end }) => ({
      groupId,
      officeId,
      startDate,
      end,
    })),
  });
}

/** The ending as the server expects it: no date with „Ende unbekannt“. */
function endFields(end: EndChoice | null) {
  return {
    endDate: end && !end.endUnknown ? end.endDate : null,
    endUnknown: end?.endUnknown ?? false,
  };
}

/**
 * The save payload: raw values (the server schema trims, nulls blanks and drops empty
 * rows), only the NONE sentinels and the endings mapped. `orders` are the holder-warning
 * orders still in effect.
 */
export function toPayload(
  v: FormValues,
  person: { id: number; updatedAt: string } | undefined,
  orders: EndPreviousOrder[],
): PersonInput {
  return {
    id: person?.id,
    // Concurrency token: the version the editor loaded, or the one its last history
    // action returned. Never re-read from refreshed props, which may hold another
    // editor's save.
    updatedAt: person?.updatedAt,
    salutation: v.salutation === NONE ? null : v.salutation,
    title: v.title,
    firstName: v.firstName,
    lastName: v.lastName,
    scoutName: v.scoutName,
    birthDate: v.birthDate,
    deathDate: v.deathDate,
    rankId: v.rankId === NONE ? null : Number(v.rankId),
    street: v.street,
    addressExtra: v.addressExtra,
    postalCode: v.postalCode,
    city: v.city,
    email: v.email,
    notes: v.notes,
    phones: v.phones.map(({ label, number }) => ({ label, number })),
    doNotPrint: v.doNotPrint,
    assignments: [
      ...v.assignments.map((a) => ({
        groupId: a.groupId,
        officeId: a.officeId,
        startDate: a.startDate,
        ...endFields(a.end),
      })),
      // Appended, so the server's row errors ("assignments.2…") still match the rows above.
      ...v.assignments
        .filter((a) => a.end?.keepMember)
        .map((a) => ({ groupId: a.groupId, officeId: null, startDate: "", endDate: null, endUnknown: false })),
    ],
    endPrevious: orders.map((o) => ({ assignmentId: o.assignmentId, ...endFields(o) })),
    distributionListIds: v.listIds,
  };
}

/**
 * The server keys row errors by position ("assignments.2.groupId"). Re-key them by the
 * row's React key ("<key>.groupId") so an error stays on its row when rows are added or
 * removed afterwards. Other keys pass through.
 */
export function keyRowErrors(errors: FieldErrors, rows: AssignmentRow[]): FieldErrors {
  const out: FieldErrors = {};
  for (const [path, message] of Object.entries(errors)) {
    const m = /^assignments\.(\d+)\.(\w+)$/.exec(path);
    const row = m ? rows[Number(m[1])] : undefined;
    const key = row ? `${row.key}.${m![2]}` : path;
    out[key] ??= message;
  }
  return out;
}
