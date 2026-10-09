import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Tx } from "@/db";
import { persons } from "@/db/schema";
import { actorName, getSession } from "@/lib/auth-helpers";
import { NAME_MAX } from "@/lib/limits";
import { ORDER_MAX } from "@/lib/master-data";

// Shared helpers for the Server Actions in src/actions/*. Every action follows the same
// shape, so the pieces live here instead of being copied per file:
//
//   export async function saveX(raw: XInput): Promise<ActionResult> {
//     return mutation(async (by) => {
//       const parsed = schema.safeParse(raw);
//       if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
//       try {
//         … write, with `stamp(by)` on the row …
//         return { ok: true };
//       } catch (err) {
//         return dbFailure(err, { unique: "… gibt es schon." });
//       }
//     });
//   }

/** Outcome of a mutation: success, or failure with a user-facing German message. */
export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * The session for a Server Action, or null when it is missing/expired. Actions must NOT
 * throw on a missing session: a thrown error replaces the page with the error boundary and
 * the user loses everything typed into the open form. Instead they return SESSION_EXPIRED,
 * which the client shows as a toast while the form keeps its state. (proxy.ts deliberately
 * lets Server Action POSTs through without a cookie so this check, not a redirect to
 * /login, answers them.)
 */
export async function getActionSession() {
  return getSession();
}

/** Failure result for an action called without a valid session (see `getActionSession`). */
export const SESSION_EXPIRED: { readonly ok: false; readonly message: string } = Object.freeze({
  ok: false,
  message:
    "Deine Sitzung ist abgelaufen. Bitte melde dich in einem neuen Tab neu an und versuche es " +
    "dann noch einmal – deine Eingaben bleiben erhalten.",
});

/**
 * The body of a mutating Server Action: answers SESSION_EXPIRED without a session, runs
 * `fn` with the actor's name for `updated_by`, and refreshes every page after a success.
 */
export async function mutation<R extends { ok: boolean }>(
  fn: (by: string) => Promise<R>,
): Promise<R | typeof SESSION_EXPIRED> {
  const session = await getActionSession();
  if (!session) return SESSION_EXPIRED;
  const result = await fn(actorName(session));
  if (result.ok) revalidateApp();
  return result;
}

/** The audit fields of a write: who (`by`, see `mutation`) and when. */
export function stamp(by: string) {
  return { updatedBy: by, updatedAt: new Date() };
}

/**
 * Called after every successful mutation (by `mutation`). Invalidates every page under the
 * root layout: the app is small, every page is dynamic and most data shows up on several
 * pages (a person's office drives the table, the Verteiler and the Stammdaten delete
 * guards), so refreshing everything is both the simplest and the correct choice. Called
 * from a Server Action this also re-renders the current page in the same response — the
 * client needs no `router.refresh()`.
 */
export function revalidateApp(): void {
  revalidatePath("/", "layout");
}

/** First Zod issue as a message, with a German fallback. */
export function firstError(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Ungültige Eingabe.";
}

/** Required display name of a master-data row (Amt, Stand, Gliederung) or a Verteiler. */
export const nameField = z
  .string()
  .trim()
  .min(1, "Name ist erforderlich.")
  .max(NAME_MAX, `Eingabe ist zu lang (max. ${NAME_MAX} Zeichen).`);

const WHOLE_NUMBER = "Bitte eine ganze Zahl eingeben.";

/**
 * The Reihenfolge of a master-data row (Amt, Stand, Gliederung): a whole number from 0
 * to ORDER_MAX with German messages. The cap sits well inside Postgres' `integer`, so an
 * out-of-range value never reaches the database and crashes the action.
 */
export function orderNumber(label: string) {
  return z
    .number({ error: WHOLE_NUMBER })
    .int(WHOLE_NUMBER)
    .min(0, `${label} darf nicht negativ sein.`)
    .max(ORDER_MAX, `${label} ist zu groß (höchstens ${ORDER_MAX}).`);
}

/**
 * Thrown inside a transaction to roll everything back with a user-facing German message.
 * The action catches it and returns `{ ok: false, message }`.
 */
export class UserFacingError extends Error {}

/** "… wurde inzwischen gelöscht" — an update or reference hit a row someone else removed. */
export function deletedMeanwhile(what: string): string {
  return `${what} wurde inzwischen gelöscht. Bitte lade die Seite neu.`;
}

/** The form is out of date (concurrent edit, row gone): only a reload can fix it. */
export class StaleError extends UserFacingError {}

/**
 * Lock a person (SELECT … FOR UPDATE) for the rest of the transaction and refuse when it
 * was deleted or saved since the editor loaded it: `expected` is the `updatedAt` the
 * editor holds, its concurrency token.
 */
export async function lockPerson(tx: Tx, personId: number, expected: string | null | undefined): Promise<void> {
  const [current] = await tx
    .select({ updatedAt: persons.updatedAt, updatedBy: persons.updatedBy })
    .from(persons)
    .where(eq(persons.id, personId))
    .for("update");
  if (!current) throw new StaleError(deletedMeanwhile("Diese Person"));
  if (current.updatedAt.toISOString() !== expected)
    throw new StaleError(
      `Diese Person wurde inzwischen ${current.updatedBy ? `von ${current.updatedBy} ` : ""}geändert. ` +
        "Bitte lade die Seite neu.",
    );
}

/**
 * The Postgres error behind a failed query, or null. drizzle wraps driver errors in a
 * `DrizzleQueryError` whose `cause` is the original `pg` error carrying the SQLSTATE
 * `code` and the violated `constraint` name, so walk the cause chain.
 */
function pgError(err: unknown): { code: string; constraint?: string } | null {
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && typeof cur === "object" && cur !== null; depth++) {
    const e = cur as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code))
      return { code: e.code, constraint: typeof e.constraint === "string" ? e.constraint : undefined };
    cur = e.cause;
  }
  return null;
}

/** The user-facing message for a violation: one for all, or per violated constraint name. */
type ViolationMessage = string | ((constraint: string | undefined) => string | undefined);

/**
 * A failed write as a result: a UserFacingError's message, or the caller's message for a
 * unique violation (the name is taken) or a foreign-key violation (a referenced row was
 * deleted meanwhile, or the row is still in use). Anything else is a bug and is rethrown.
 */
export function dbFailure(
  err: unknown,
  messages: { unique?: ViolationMessage; fk?: ViolationMessage },
): { ok: false; message: string } {
  if (err instanceof UserFacingError) return { ok: false, message: err.message };
  const pg = pgError(err);
  const violation = pg?.code === "23505" ? messages.unique : pg?.code === "23503" ? messages.fk : undefined;
  const message = typeof violation === "function" ? violation(pg?.constraint) : violation;
  if (message) return { ok: false, message };
  throw err;
}

/**
 * Delete an Amt, Stand or Gliederung unless it is still in use. `blockers` is the guard
 * the page checks up front (src/db/queries.ts), so the server refuses exactly what the
 * dialog blocks; the foreign key catches a reference added between that check and `remove`.
 */
export async function guardedDelete(
  id: number,
  blockers: () => Promise<Map<number, string>>,
  remove: () => Promise<unknown>,
  subject: string,
): Promise<ActionResult> {
  const blocker = (await blockers()).get(id);
  if (blocker) return { ok: false, message: blocker };
  try {
    await remove();
    return { ok: true };
  } catch (err) {
    return dbFailure(err, { fk: `${subject} wird inzwischen verwendet und kann nicht gelöscht werden.` });
  }
}
