// Pure filter, search and selection rules of the directory ("/"). No React, no DB:
// unit-tested in directory-filter.test.ts.
import type { PersonListRow } from "@/db/queries";
import { buildBcc, type BccResult } from "@/lib/export";
import { fold } from "@/lib/format";
import { descendantIds } from "@/lib/groups";
import { parseId } from "@/lib/ids";

// --- URL state ------------------------------------------------------------------------

/** Query parameter names: the directory URL is shareable and the editor returns to it. */
export const PARAM = {
  q: "q",
  groupId: "gliederung",
  officeId: "amt",
  listId: "verteiler",
  sort: "sortierung",
} as const;

/** The one non-default sort order, as written to the URL. */
export const SORT_DESC = "absteigend";

export type DirectoryFilters = {
  /** Raw search text (folded and split into words when matching). */
  q: string;
  /** Gliederung, matched together with all of its Untergliederungen. */
  groupId: number | null;
  officeId: number | null;
  /** Verteiler, by effective membership (manual ∪ rules). */
  listId: number | null;
};

type DirectoryParams = DirectoryFilters & { sortDesc: boolean };

/** Read the directory state from the URL; anything malformed counts as "not set". */
export function parseDirectoryParams(params: { get(name: string): string | null }): DirectoryParams {
  return {
    q: params.get(PARAM.q) ?? "",
    groupId: parseId(params.get(PARAM.groupId)),
    officeId: parseId(params.get(PARAM.officeId)),
    listId: parseId(params.get(PARAM.listId)),
    sortDesc: params.get(PARAM.sort) === SORT_DESC,
  };
}

export function hasActiveFilters(f: DirectoryFilters): boolean {
  return searchWords(f.q).length > 0 || f.groupId != null || f.officeId != null || f.listId != null;
}

// --- search ----------------------------------------------------------------------------

/** Precomputed per person once, so a keystroke only runs `includes` checks. */
type SearchIndex = {
  /** Folded text of everything the list shows (and the street): who types what they see finds it. */
  searchText: string;
  /** Every phone number reduced to its digits, space-separated. */
  searchDigits: string;
};

const digitsOnly = (s: string) => s.replace(/\D/g, "");

export function searchIndex(p: PersonListRow): SearchIndex {
  return {
    searchText: fold(
      [
        p.lastName,
        p.firstName,
        p.scoutName,
        p.rankName,
        p.street,
        p.city,
        p.email,
        ...p.assignments.flatMap((a) => [a.officeName, a.groupName]),
      ]
        .filter(Boolean)
        .join(" "),
    ),
    searchDigits: p.phones.map((ph) => digitsOnly(ph.number)).join(" "),
  };
}

/** A query word made of digits and phone punctuation ("0251/40003", "+49", "(0170)"). */
const PHONE_WORD = /^[\d+()/.-]+$/;

/**
 * The folded words of a search query (empty for a blank query). Commas and semicolons
 * separate words too, so the name as the list prints it ("Müller, Anna") finds the person.
 */
function searchWords(query: string): string[] {
  return fold(query).split(/[\s,;]+/).filter(Boolean);
}

/**
 * Every query word must occur somewhere, in any order, umlaut-insensitive (the rule of
 * `matchesQuery`). A word that looks like a phone number is also compared digit by
 * digit, so "0170-1000003" finds "0170 1000003".
 */
function matchesSearch(index: SearchIndex, words: readonly string[]): boolean {
  return words.every((word) => {
    if (index.searchText.includes(word)) return true;
    const digits = PHONE_WORD.test(word) ? digitsOnly(word) : "";
    return digits !== "" && index.searchDigits.includes(digits);
  });
}

// --- filtering ---------------------------------------------------------------------------

/**
 * Apply search and filters. A Gliederung matches its whole subtree; Gliederung and Amt
 * together must hold on the same assignment ("Gauvögte in Westfalen", not "a Gauvogt
 * somewhere who is also a member in Westfalen").
 */
export function filterPersons<T extends PersonListRow & SearchIndex>(
  rows: readonly T[],
  f: DirectoryFilters,
  groups: readonly { id: number; parentId: number | null }[],
): T[] {
  const words = searchWords(f.q);
  const groupIds = f.groupId == null ? null : new Set([f.groupId, ...descendantIds(groups, f.groupId)]);
  const byAssignment = groupIds != null || f.officeId != null;
  return rows.filter(
    (p) =>
      matchesSearch(p, words) &&
      (!byAssignment ||
        p.assignments.some(
          (a) => (groupIds == null || groupIds.has(a.groupId)) && (f.officeId == null || a.officeId === f.officeId),
        )) &&
      (f.listId == null || p.effectiveListIds.includes(f.listId)),
  );
}

// --- selection ---------------------------------------------------------------------------

type MailSelection = {
  /** Living selected persons: the only ones a mailing or the BCC copy goes to. */
  personIds: number[];
  /** Selected persons left out because they are deceased. */
  deceased: number;
  /** Deduplicated addresses of the living ones (and how many had none / an invalid one). */
  bcc: BccResult;
};

/** Recipients of "E-Mail-Adressen kopieren" and "E-Mail schreiben": deceased persons never get mail. */
export function mailSelection(
  selected: readonly Pick<PersonListRow, "id" | "email" | "deathDate">[],
): MailSelection {
  const living = selected.filter((p) => !p.deathDate);
  return {
    personIds: living.map((p) => p.id),
    deceased: selected.length - living.length,
    bcc: buildBcc(
      living.map((p) => p.email),
      "; ",
    ),
  };
}
