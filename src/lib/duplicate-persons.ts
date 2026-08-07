// Pure duplicate-person matching for the "Ähnliche Einträge"-Hinweis in the create
// form. No DB, no side effects — safe on the client and fully unit-testable.

import { fold } from "./format";

export type PersonNameParts = {
  firstName?: string | null;
  lastName?: string | null;
  scoutName?: string | null;
};

export type PersonCandidate = PersonNameParts & { id: number };

/** How many hints to show at most — a soft cap so the callout stays quiet. */
export const MAX_SIMILAR = 5;

function foldOrEmpty(value?: string | null): string {
  return value ? fold(value) : "";
}

/**
 * Find existing persons whose name looks like the one being typed, so the Kanzlerin
 * gets a soft "already exists?" hint. Advisory only — never blocks saving.
 *
 * Matching rule (kept deliberately easy to reason about), on DIN 5007-2 folded names:
 *   A) same last name AND compatible first name — first names equal, or either side
 *      has no first name yet (so "Specht" matches "Specht, Holger"); OR
 *   B) same Fahrtenname (scout name).
 *
 * Nothing is matched until at least a last name or a scout name has been entered, and
 * the result is capped at `limit` candidates (in candidate order).
 */
export function findSimilarPersons<C extends PersonCandidate>(
  input: PersonNameParts,
  candidates: C[],
  limit: number = MAX_SIMILAR,
): C[] {
  const inFirst = foldOrEmpty(input.firstName);
  const inLast = foldOrEmpty(input.lastName);
  const inScout = foldOrEmpty(input.scoutName);

  // Too little typed to say anything useful — stay silent.
  if (!inLast && !inScout) return [];

  const matches: C[] = [];
  for (const c of candidates) {
    const cFirst = foldOrEmpty(c.firstName);
    const cLast = foldOrEmpty(c.lastName);
    const cScout = foldOrEmpty(c.scoutName);

    // Rule A: same last name, first names compatible (equal or one side missing).
    const lastNameMatch =
      inLast !== "" &&
      cLast === inLast &&
      (inFirst === "" || cFirst === "" || inFirst === cFirst);

    // Rule B: same Fahrtenname.
    const scoutMatch = inScout !== "" && cScout === inScout;

    if (lastNameMatch || scoutMatch) {
      matches.push(c);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}
