import { z } from "zod";

// Shared input contract for the person editor (client) and the save action (server).
// German, field-keyed messages so the editor can show them inline.

// Generous upper bounds — real values are far shorter; this only blocks
// accidental or hostile megabyte-sized payloads.
const shortText = z.string().max(200, "Eingabe ist zu lang (max. 200 Zeichen).");
const longText = z.string().max(2000, "Eingabe ist zu lang (max. 2000 Zeichen).");

export const phoneInputSchema = z.object({
  label: shortText,
  number: shortText,
});

export const assignmentInputSchema = z.object({
  groupId: z.number().int(),
  officeId: z.number().int().nullable(),
  // Amtszeit "seit" (issue #22). NULL = unknown.
  startDate: shortText.nullable().default(null),
  // Amtszeit "bis": NULL = active. A row with an end date is stored as a finished
  // tenure (history), so past offices can be captured directly when creating a person.
  endDate: shortText.nullable().default(null),
});

/**
 * Holder-warning follow-up (issue #26): "end this other person's active tenure when
 * you save me". Targets a *foreign* active assignment; `savePerson` runs it in the
 * same transaction and validates ownership/liveness there. `endUnknown = false` means
 * the `endDate` is mandatory and validated (against the target's start) server-side.
 */
export const endPreviousInputSchema = z.object({
  assignmentId: z.number().int().positive(),
  endDate: shortText.nullable().default(null),
  endUnknown: z.boolean().default(false),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ISO calendar date, e.g. "2019-03-01". The <input type="date"> emits exactly this.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real ISO calendar date. Rejects malformed strings and impossible days (02-30). */
export function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Validate an Amtszeit (von/bis) for the office history. Pure so it can be unit-tested
 * and reused by every server action. Returns a German error message, or null when valid.
 * Either bound may be null (unknown); when both are set, end must not precede start.
 */
export function validateTenure(
  startDate: string | null,
  endDate: string | null,
): string | null {
  if (startDate != null && !isValidDate(startDate)) return "Ungültiges Von-Datum.";
  if (endDate != null && !isValidDate(endDate)) return "Ungültiges Bis-Datum.";
  // ISO date strings compare lexicographically in chronological order.
  if (startDate != null && endDate != null && endDate < startDate)
    return "Das Bis-Datum darf nicht vor dem Von-Datum liegen.";
  return null;
}

/**
 * Validate a person's own life dates (Geburts-/Sterbedatum). Both bounds are optional
 * (empty/null accepted); when both are set the death must not precede the birth. Pure so
 * savePerson can share it. Returns a German error message, or null when valid.
 */
export function validatePersonDates(
  birthDate: string | null,
  deathDate: string | null,
): string | null {
  if (birthDate != null && !isValidDate(birthDate)) return "Ungültiges Geburtsdatum.";
  if (deathDate != null && !isValidDate(deathDate)) return "Ungültiges Sterbedatum.";
  if (birthDate != null && deathDate != null && deathDate < birthDate)
    return "Das Sterbedatum darf nicht vor dem Geburtsdatum liegen.";
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
    return { ok: false, message: "Bitte ein Bis-Datum angeben oder „Datum unbekannt“ wählen." };
  const tenureError = validateTenure(input.startDate, end);
  if (tenureError) return { ok: false, message: tenureError };
  return { ok: true, endDate: end, endUnknown: false };
}

export const personInputSchema = z
  .object({
    id: z.number().int().optional(),
    salutation: shortText.nullable(),
    title: shortText.nullable(),
    firstName: shortText.nullable(),
    lastName: shortText.nullable(),
    scoutName: shortText.nullable(),
    birthDate: shortText.nullable(),
    deathDate: shortText.nullable(),
    rankId: z.number().int().nullable(),
    street: shortText.nullable(),
    addressExtra: shortText.nullable(),
    postalCode: shortText.nullable(),
    city: shortText.nullable(),
    email: shortText.nullable(),
    phones: z.array(phoneInputSchema).max(20),
    notes: longText.nullable(),
    doNotPrint: z.boolean(),
    assignments: z.array(assignmentInputSchema),
    endPrevious: z.array(endPreviousInputSchema).max(50).default([]),
    distributionListIds: z.array(z.number().int()).default([]),
  })
  .superRefine((val, ctx) => {
    const hasLast = !!val.lastName && val.lastName.trim().length > 0;
    const hasScout = !!val.scoutName && val.scoutName.trim().length > 0;
    if (!hasLast && !hasScout) {
      ctx.addIssue({
        code: "custom",
        path: ["lastName"],
        message: "Nachname oder Fahrtenname ist erforderlich.",
      });
    }
    if (val.email && val.email.trim().length > 0 && !EMAIL_RE.test(val.email.trim())) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Bitte eine gültige E-Mail-Adresse eingeben.",
      });
    }
    if (val.postalCode && val.postalCode.trim().length > 0 && !/^\d{5}$/.test(val.postalCode.trim())) {
      ctx.addIssue({
        code: "custom",
        path: ["postalCode"],
        message: "Die PLZ muss aus 5 Ziffern bestehen.",
      });
    }
  });

export type PhoneInput = z.infer<typeof phoneInputSchema>;
export type AssignmentInput = z.infer<typeof assignmentInputSchema>;
export type EndPreviousInput = z.infer<typeof endPreviousInputSchema>;
export type PersonInput = z.infer<typeof personInputSchema>;

export type FieldErrors = Record<string, string>;

/** Parse + validate a person payload. Returns either clean data or field-keyed German errors. */
export function parsePersonInput(
  raw: unknown,
): { ok: true; data: PersonInput } | { ok: false; errors: FieldErrors } {
  const result = personInputSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

const trimOrNull = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
};

/** Drop empty numbers, default the label, dedupe assignments by (group, office). */
export function cleanPersonInput(input: PersonInput): PersonInput {
  const seen = new Set<string>();
  const uniqueAssignments: AssignmentInput[] = [];
  for (const a of input.assignments) {
    if (!a.groupId) continue;
    // The end date is part of the identity: the same combination may appear once
    // active and once (or repeatedly) as finished tenures — only exact duplicates collapse.
    const key = `${a.groupId}:${a.officeId ?? "null"}:${trimOrNull(a.endDate) ?? "active"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Keep the tenure dates; blank strings become null (unknown / active).
    uniqueAssignments.push({
      groupId: a.groupId,
      officeId: a.officeId ?? null,
      startDate: trimOrNull(a.startDate),
      endDate: trimOrNull(a.endDate),
    });
  }

  return {
    ...input,
    distributionListIds: [...new Set(input.distributionListIds)],
    salutation: trimOrNull(input.salutation),
    title: trimOrNull(input.title),
    firstName: trimOrNull(input.firstName),
    lastName: trimOrNull(input.lastName),
    scoutName: trimOrNull(input.scoutName),
    birthDate: trimOrNull(input.birthDate),
    deathDate: trimOrNull(input.deathDate),
    street: trimOrNull(input.street),
    addressExtra: trimOrNull(input.addressExtra),
    postalCode: trimOrNull(input.postalCode),
    city: trimOrNull(input.city),
    email: trimOrNull(input.email),
    notes: trimOrNull(input.notes),
    phones: input.phones
      .map((p) => ({ label: (p.label || "Telefon").trim() || "Telefon", number: (p.number ?? "").trim() }))
      .filter((p) => p.number.length > 0),
    assignments: uniqueAssignments,
  };
}
