import { z } from "zod";

import { EMAIL_RE } from "@/lib/export";
import { todayIso } from "@/lib/format";

// Shared input contract for the person editor (client) and the save action (server).
// German, field-keyed messages so the editor can show them inline.

// Generous upper bounds — real values are far shorter; this only blocks
// accidental or hostile megabyte-sized payloads.

/** Optional free text: trimmed and bounded; blank (or missing) becomes null. */
function optText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Eingabe ist zu lang (max. ${max} Zeichen).`)
    .nullish()
    .transform((v) => v || null);
}
const shortText = optText(200);
const longText = optText(2000);
const rowId = z.number().int().positive();

/** One phone row as the form sends it; blank numbers are dropped by the person schema. */
export const phoneInputSchema = z.object({ label: shortText, number: shortText });

/**
 * One "Ämter & Gliederung" row as the form sends it. `groupId` may be null only for a row
 * the user left without a Gliederung: an entirely empty row is dropped, anything else
 * (an Amt or a date without a Gliederung) is rejected instead of silently lost.
 * A row with `endDate` or `endUnknown` is stored as a finished tenure (history), so past
 * offices can be captured directly and "Amt beenden" can be buffered until Speichern.
 */
export const assignmentInputSchema = z.object({
  groupId: rowId.nullable(),
  officeId: rowId.nullable().default(null),
  // Amtszeit "seit" (issue #22). NULL = unknown.
  startDate: shortText,
  // Amtszeit "bis": NULL = active (unless endUnknown).
  endDate: shortText,
  // "Ende unbekannt": stored with end_date = today as the documented upper bound.
  endUnknown: z.boolean().default(false),
});

/**
 * Holder-warning follow-up (issue #26): "end this other person's active tenure when
 * you save me". Targets a *foreign* active assignment; `savePerson` runs it in the
 * same transaction and validates ownership/liveness there. `endUnknown = false` means
 * the `endDate` is mandatory and validated (against the target's start) server-side.
 */
export const endPreviousInputSchema = z.object({
  assignmentId: rowId,
  endDate: shortText,
  endUnknown: z.boolean().default(false),
});

// ISO calendar date, e.g. "2019-03-01". The <input type="date"> emits exactly this.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real ISO calendar date. Rejects malformed strings and impossible days (02-30). */
export function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Validate an Amtszeit (von/bis) for the office history. Pure (given `today`) so it can be
 * unit-tested and reused by every server action. Returns a German error message, or null
 * when valid. Either bound may be null (unknown); when both are set, end must not precede
 * start. The end must not lie in the future: "active" means `end_date IS NULL` everywhere
 * (table, Verteiler, mail, PDF), so a planned end date would drop the person from every
 * list at once. `today` defaults to the current Berlin date.
 */
export function validateTenure(
  startDate: string | null,
  endDate: string | null,
  today: string = todayIso(),
): string | null {
  if (startDate != null && !isValidDate(startDate)) return "Ungültiges Von-Datum.";
  if (endDate != null && !isValidDate(endDate)) return "Ungültiges Bis-Datum.";
  if (endDate != null && endDate > today)
    return "Das Bis-Datum darf nicht in der Zukunft liegen – lass das Amt bis dahin aktiv.";
  // ISO date strings compare lexicographically in chronological order.
  if (startDate != null && endDate != null && endDate < startDate)
    return "Das Bis-Datum darf nicht vor dem Von-Datum liegen.";
  return null;
}

/**
 * Validate a person's own life dates (Geburts-/Sterbedatum). Both are optional (null
 * accepted); neither may lie in the future, and the death must not precede the birth.
 * Pure (given `today`, default: the Berlin date) so it can be unit-tested. Returns the
 * offending field with a German message, or null when valid.
 */
export function validatePersonDates(
  birthDate: string | null,
  deathDate: string | null,
  today: string = todayIso(),
): { field: "birthDate" | "deathDate"; message: string } | null {
  if (birthDate != null && !isValidDate(birthDate)) return { field: "birthDate", message: "Ungültiges Geburtsdatum." };
  if (birthDate != null && birthDate > today)
    return { field: "birthDate", message: "Das Geburtsdatum darf nicht in der Zukunft liegen." };
  if (deathDate != null && !isValidDate(deathDate)) return { field: "deathDate", message: "Ungültiges Sterbedatum." };
  if (deathDate != null && deathDate > today)
    return { field: "deathDate", message: "Das Sterbedatum darf nicht in der Zukunft liegen." };
  if (birthDate != null && deathDate != null && deathDate < birthDate)
    return { field: "deathDate", message: "Das Sterbedatum darf nicht vor dem Geburtsdatum liegen." };
  return null;
}

/**
 * Resolve the end of a tenure being closed ("Amt beenden", "Frühere Ämter", holder
 * warning), given the user's choice of a concrete Bis-Datum *or* "Ende unbekannt".
 * Pure so every server action shares it and it can be unit-tested (issue #26).
 *
 * "Ende unbekannt" documents an upper bound: the tenure was over by `today` at the
 * latest, so `end_date` is set to `today` and `endUnknown = true`. The active marker
 * stays `end_date IS NULL`, so a closed tenure always carries a real end date and is
 * never mistaken for active. The unknown branch does NOT run `validateTenure`: `today`
 * is a fixed upper bound, not a user date, and may legitimately precede an unknown
 * (or even future-dated) start without being an input error.
 *
 * Returns the resolved `{ endDate, endUnknown }` or a German error message.
 */
export function resolveTenureEnd(input: {
  startDate: string | null;
  endDate: string | null;
  endUnknown: boolean;
  today: string;
}): { ok: true; endDate: string; endUnknown: true } | { ok: true; endDate: string; endUnknown: false } | { ok: false; message: string } {
  if (input.endUnknown) {
    return { ok: true, endDate: input.today, endUnknown: true };
  }
  const end = (input.endDate ?? "").trim();
  if (end.length === 0)
    return { ok: false, message: "Bitte gib ein Bis-Datum an oder wähle „Ende unbekannt“." };
  const tenureError = validateTenure(input.startDate, end, input.today);
  if (tenureError) return { ok: false, message: tenureError };
  return { ok: true, endDate: end, endUnknown: false };
}

/** Which date field an assignment's `validateTenure` message belongs to. */
function tenureErrorField(message: string): "startDate" | "endDate" {
  return message === "Ungültiges Von-Datum." ? "startDate" : "endDate";
}

/**
 * The person payload: parsing it trims every text, turns blanks into null, drops blank
 * phone numbers and empty assignment rows, and checks every rule with a field path, so
 * `savePerson` parses exactly once and the editor can mark the offending field.
 */
export const personInputSchema = z
  .object({
    id: rowId.optional(),
    /** `updated_at` of the record the form was loaded from — the optimistic-concurrency token. */
    updatedAt: z.string().max(40).nullish(),
    salutation: shortText,
    title: shortText,
    firstName: shortText,
    lastName: shortText,
    scoutName: shortText,
    birthDate: shortText,
    deathDate: shortText,
    rankId: rowId.nullable(),
    street: shortText,
    addressExtra: shortText,
    postalCode: shortText,
    city: shortText,
    email: shortText,
    phones: z
      .array(phoneInputSchema)
      .max(20)
      .transform((rows) =>
        rows.flatMap((p) => (p.number ? [{ label: p.label ?? "Telefon", number: p.number }] : [])),
      ),
    notes: longText,
    doNotPrint: z.boolean(),
    assignments: z.array(assignmentInputSchema).max(100),
    endPrevious: z.array(endPreviousInputSchema).max(50).default([]),
    distributionListIds: z
      .array(rowId)
      .max(500)
      .default([])
      .transform((ids) => [...new Set(ids)]),
  })
  .superRefine((val, ctx) => {
    if (!val.lastName && !val.scoutName)
      ctx.addIssue({ code: "custom", path: ["lastName"], message: "Nachname oder Fahrtenname ist erforderlich." });
    if (val.email && !EMAIL_RE.test(val.email))
      ctx.addIssue({ code: "custom", path: ["email"], message: "Bitte eine gültige E-Mail-Adresse eingeben." });
    if (val.postalCode && !/^\d{5}$/.test(val.postalCode))
      ctx.addIssue({ code: "custom", path: ["postalCode"], message: "Die PLZ muss aus 5 Ziffern bestehen." });

    const dateError = validatePersonDates(val.birthDate, val.deathDate);
    if (dateError) ctx.addIssue({ code: "custom", path: [dateError.field], message: dateError.message });

    const seen = new Set<string>();
    val.assignments.forEach((a, i) => {
      const empty = a.groupId == null && a.officeId == null && !a.startDate && !a.endDate && !a.endUnknown;
      if (empty) return;
      if (a.groupId == null) {
        ctx.addIssue({
          code: "custom",
          path: ["assignments", i, "groupId"],
          message: "Bitte zu jedem Amt eine Gliederung wählen.",
        });
        return;
      }
      // "Ende unbekannt" needs no Bis-Datum (the server records today); only check the start.
      const tenureError = validateTenure(a.startDate, a.endUnknown ? null : a.endDate);
      if (tenureError)
        ctx.addIssue({ code: "custom", path: ["assignments", i, tenureErrorField(tenureError)], message: tenureError });
      // The end is part of the identity: one active row plus finished tenures of the same
      // combination are fine, only exact duplicates are refused.
      const key = `${a.groupId}:${a.officeId ?? "-"}:${a.endUnknown ? "unknown" : (a.endDate ?? "active")}`;
      if (seen.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["assignments", i, "groupId"],
          message: "Dieselbe Amt-Gliederungs-Kombination ist doppelt zugeordnet.",
        });
      seen.add(key);
    });
  })
  .transform((val) => ({
    ...val,
    // Only empty rows can still lack a Gliederung here (superRefine rejected the rest).
    assignments: val.assignments.flatMap((a) => (a.groupId == null ? [] : [{ ...a, groupId: a.groupId }])),
  }));

/** What the editor sends (raw form values; blanks allowed). */
export type PersonInput = z.input<typeof personInputSchema>;
/** What `savePerson` works with after parsing (normalised, validated). */
export type PersonData = z.output<typeof personInputSchema>;

export type FieldErrors = Record<string, string>;

/** Parse + validate a person payload. Returns either clean data or field-keyed German errors. */
export function parsePersonInput(
  raw: unknown,
): { ok: true; data: PersonData } | { ok: false; errors: FieldErrors } {
  const result = personInputSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
