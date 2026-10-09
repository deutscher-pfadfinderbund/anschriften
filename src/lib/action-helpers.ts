import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { z } from "zod";

import { auth } from "@/lib/auth";

// Shared helpers for the Server Actions in src/actions/*. Every action file needs the
// same result shape, Zod-error formatting and Postgres SQLSTATE checks, so they live
// here instead of being copied per file.

/** Outcome of a mutation: success, or failure with a user-facing German message. */
export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * The session for a Server Action, or null when it is missing/expired. Actions must NOT
 * throw on a missing session: a thrown error replaces the page with the error boundary and
 * the user loses everything typed into the open form. Instead they return SESSION_EXPIRED,
 * which the client shows as a toast while the form keeps its state:
 *
 *   const session = await getActionSession();
 *   if (!session) return SESSION_EXPIRED;
 *
 * (proxy.ts deliberately lets Server Action POSTs through without a cookie so this check,
 * not a redirect to /login, answers them.)
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

/** "Today" in Europe/Berlin as ISO date — the documented upper bound for "Ende unbekannt". */
export { todayIso } from "@/lib/format";

/**
 * Revalidate every page whose data reflects a person + assignment change: the directory
 * ("/"), the Verteiler badges, and the Stammdaten/Gliederungen delete guards fed by
 * groupUsage/officeUsage (see src/db/queries.ts). Shared by the person and assignment
 * actions so their revalidation sets cannot drift apart.
 */
export function revalidatePersonPaths(): void {
  revalidatePath("/");
  revalidatePath("/verteiler");
  revalidatePath("/stammdaten");
  revalidatePath("/gliederungen");
}

/** First Zod issue as a message, with a German fallback. */
export function firstError(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Ungültige Eingabe.";
}

/** Postgres unique-violation SQLSTATE — a UNIQUE (or partial unique) index rejected the row. */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505"
  );
}

/** Postgres foreign-key-violation SQLSTATE — a referenced row is (still) in use. */
export function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23503"
  );
}
