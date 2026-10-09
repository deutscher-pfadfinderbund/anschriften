// Client-side mirror of the master-data save rules (Ämter, Stände, Gliederungen), so the
// edit dialogs can explain a problem under the field before anything is sent. The server
// actions stay authoritative: `orderNumber`/`nameField` in src/lib/action-helpers.ts and
// the UNIQUE index on `name`.

/** Largest Reihenfolge the server accepts (mirrors `orderNumber`). */
export const ORDER_MAX = 99_999;

/** Message for a Reihenfolge that `parseOrder` rejects. */
export const ORDER_ERROR = `Bitte eine ganze Zahl von 0 bis ${ORDER_MAX} eingeben.`;

/**
 * The Reihenfolge field's value: the number, `null` when the field is empty, or
 * `undefined` when the input is not a whole number from 0 to ORDER_MAX.
 */
export function parseOrder(input: string): number | null | undefined {
  const s = input.trim();
  if (s === "") return null;
  return /^\d+$/.test(s) && Number(s) <= ORDER_MAX ? Number(s) : undefined;
}

/**
 * Error for the Reihenfolge field, or null when it is fine. An empty field is only valid
 * where it means something (an Amt without Reihenfolge goes to the end).
 */
export function orderError(input: string, allowEmpty = false): string | null {
  const value = parseOrder(input);
  return value === undefined || (value === null && !allowEmpty) ? ORDER_ERROR : null;
}

/**
 * Reihenfolge for a new entry: 10 after the largest existing one, so it lands at the
 * end and leaves room to slot entries in between later.
 */
export function nextOrder(existing: readonly number[]): number {
  return Math.min(Math.max(0, ...existing) + 10, ORDER_MAX);
}

/**
 * Whether another entry already carries this name. Same comparison as the database's
 * UNIQUE index on the trimmed name (the actions trim before saving): exact, case-sensitive.
 */
export function isDuplicateName(
  name: string,
  entries: readonly { id: number; name: string }[],
  selfId: number | null,
): boolean {
  const trimmed = name.trim();
  return trimmed !== "" && entries.some((e) => e.id !== selfId && e.name === trimmed);
}
