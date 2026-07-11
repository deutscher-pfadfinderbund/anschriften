import type { z } from "zod";

// Shared helpers for the Server Actions in src/actions/*. Every action file needs the
// same result shape, Zod-error formatting and Postgres SQLSTATE checks, so they live
// here instead of being copied per file.

/** Outcome of a mutation: success, or failure with a user-facing German message. */
export type ActionResult = { ok: true } | { ok: false; message: string };

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
