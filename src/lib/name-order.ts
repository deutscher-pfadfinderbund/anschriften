import { fold, type PersonName } from "@/lib/format";

/** German collation: umlauts sort next to their base letter (the DB's C collation puts them after Z). */
export const collateDe = new Intl.Collator("de").compare;

/** By `name`, German collation. */
export const byName = (a: { name: string }, b: { name: string }) => collateDe(a.name, b.name);

/**
 * Compare multi-field sort keys field by field. Fields must be compared on their own:
 * joined into one string, the separator would take part in the comparison (under the de
 * collation `" " < "#"`, so "habicht ii#marcel" would sort before "habicht#hans-juergen").
 */
export function compareFields(a: readonly string[], b: readonly string[]): number {
  for (let i = 0; i < a.length; i += 1) {
    const cmp = collateDe(a[i] ?? "", b[i] ?? "");
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/**
 * Directory order for people: last name (the scout name when there is none), then first
 * name, then scout name. Each field is folded (DIN 5007-2) and compared on its own, so
 * "Schmidt" sorts before "Schmidt-Meyer" whatever the first names are. Folds every name
 * once, not per comparison; returns a new array.
 */
export function sortByDirectoryName<T extends PersonName>(rows: readonly T[]): T[] {
  const keyed = rows.map((row) => ({
    row,
    key: [row.lastName || row.scoutName, row.firstName, row.scoutName].map((s) => fold(s ?? "")),
  }));
  return keyed.sort((a, b) => compareFields(a.key, b.key)).map(({ row }) => row);
}
