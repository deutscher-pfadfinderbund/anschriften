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
  // Amtszeit "seit" (issue #22). NULL = unknown. Active rows never carry an end date;
  // ended tenures are managed out of band via the assignment history actions.
  startDate: shortText.nullable().default(null),
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
