// Input length limits, shared by the server schemas and the form fields' `maxLength`.
// Generous upper bounds — real values are far shorter; they only block accidental or
// hostile megabyte-sized payloads. Pure, client-safe.

/** Name of an Amt, Stand, Gliederung or Verteiler. */
export const NAME_MAX = 200;
/** Any other one-line text: the person fields, a Gliederung's Art. */
export const TEXT_MAX = 200;
/** Multi-line text: a Verteiler's description, a person's notes. */
export const DESCRIPTION_MAX = 2000;
/** Rundmail subject and body. */
export const SUBJECT_MAX = 200;
export const BODY_MAX = 50_000;
