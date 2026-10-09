import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { ORDER_MAX } from "@/lib/master-data";

// Shared helpers for the Server Actions in src/actions/*. Every action follows the same
// shape, so the pieces live here instead of being copied per file:
//
//   const session = await getActionSession();
//   if (!session) return SESSION_EXPIRED;
//   const parsed = schema.safeParse(raw);
//   if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
//   … write …
//   revalidateApp();
//   return { ok: true };

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
  return auth.api.getSession({ headers: await headers() });
}

/** Failure result for an action called without a valid session (see `getActionSession`). */
export const SESSION_EXPIRED: { readonly ok: false; readonly message: string } = Object.freeze({
  ok: false,
  message:
    "Deine Sitzung ist abgelaufen. Bitte melde dich in einem neuen Tab neu an und versuche es " +
    "dann noch einmal – deine Eingaben bleiben erhalten.",
});

/**
 * Call once at the end of every successful mutation. Invalidates every page under the
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
  .max(200, "Eingabe ist zu lang (max. 200 Zeichen).");

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

/** "Diese Person wurde inzwischen (von X) geändert" — the editor's concurrency token is stale. */
export function changedMeanwhile(updatedBy: string | null): string {
  return `Diese Person wurde inzwischen ${updatedBy ? `von ${updatedBy} ` : ""}geändert. Bitte lade die Seite neu.`;
}

/**
 * The Postgres error behind a failed query, or null. drizzle wraps driver errors in a
 * `DrizzleQueryError` whose `cause` is the original `pg` error carrying the SQLSTATE
 * `code` and the violated `constraint` name, so walk the cause chain.
 */
export function pgError(err: unknown): { code: string; constraint?: string } | null {
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && typeof cur === "object" && cur !== null; depth++) {
    const e = cur as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code))
      return { code: e.code, constraint: typeof e.constraint === "string" ? e.constraint : undefined };
    cur = e.cause;
  }
  return null;
}

/** Postgres unique-violation SQLSTATE — a UNIQUE (or partial unique) index rejected the row. */
export function isUniqueViolation(err: unknown): boolean {
  return pgError(err)?.code === "23505";
}

/** Postgres foreign-key-violation SQLSTATE — a referenced row is missing or still in use. */
export function isForeignKeyViolation(err: unknown): boolean {
  return pgError(err)?.code === "23503";
}
