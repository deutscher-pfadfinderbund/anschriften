import { z } from "zod";

// Shared input contract for the person editor (client) and the save action (server).
// German, field-keyed messages so the editor can show them inline.

export const phoneInputSchema = z.object({
  label: z.string(),
  number: z.string(),
});

export const assignmentInputSchema = z.object({
  groupId: z.number().int(),
  officeId: z.number().int().nullable(),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const personInputSchema = z
  .object({
    id: z.number().int().optional(),
    salutation: z.string().nullable(),
    title: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    scoutName: z.string().nullable(),
    birthDate: z.string().nullable(),
    deathDate: z.string().nullable(),
    rankId: z.number().int().nullable(),
    street: z.string().nullable(),
    addressExtra: z.string().nullable(),
    postalCode: z.string().nullable(),
    city: z.string().nullable(),
    email: z.string().nullable(),
    phones: z.array(phoneInputSchema),
    notes: z.string().nullable(),
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
