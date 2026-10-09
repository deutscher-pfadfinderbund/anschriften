import { fold } from "@/lib/format";

type Named = { firstName: string | null; lastName: string | null; scoutName: string | null };

const compareFolded = (a: string | null, b: string | null) =>
  fold(a ?? "").localeCompare(fold(b ?? ""), "de");

/**
 * Directory order for people: last name (the scout name when there is none), then first
 * name, then scout name. Each field is folded (DIN 5007-2) and compared on its own, so
 * "Schmidt" sorts before "Schmidt-Meyer" whatever the first names are.
 */
export function byDirectoryName(a: Named, b: Named): number {
  return (
    compareFolded(a.lastName || a.scoutName, b.lastName || b.scoutName) ||
    compareFolded(a.firstName, b.firstName) ||
    compareFolded(a.scoutName, b.scoutName)
  );
}
