// Optional mail module (issue #19). Active only when SMTP_HOST and MAIL_FROM are
// configured; otherwise `isMailEnabled()` is false, the UI hides all mail actions
// and the server action refuses. Provider-agnostic: a plain SMTP transport via
// nodemailer, so switching provider (own server, SES, Postmark, Brevo, Mailjet …)
// is a `.env` change with no code change. Plaintext only — no HTML, no
// attachments (YAGNI; keeps the abuse surface small).
import nodemailer from "nodemailer";

import { db } from "@/db";
import { mailLog } from "@/db/schema";

/**
 * True when the mail module is configured (SMTP host + From address present).
 * Read at call time — never captured at import — so restarting the server without
 * the SMTP vars really disables the module.
 */
export function isMailEnabled(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.MAIL_FROM?.trim());
}

/** Split `items` into consecutive chunks of at most `size` (clamped to ≥ 1). Pure. */
export function chunk<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** BCC chunk size from `MAIL_BCC_CHUNK_SIZE`, default 50, clamped to ≥ 1. */
export function bccChunkSize(): number {
  const raw = Number(process.env.MAIL_BCC_CHUNK_SIZE);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 50;
}

/**
 * Turn a caught SMTP error into a short, privacy-preserving string for
 * `mail_log.error`. SMTP rejections often echo recipient addresses; those are
 * PII and must not be persisted. We keep the nodemailer error code and SMTP
 * response code (the useful debugging signal), take only the first line, and
 * mask any e-mail address in it.
 */
export function sanitizeMailError(err: unknown): string {
  const e = err as { code?: unknown; responseCode?: unknown; message?: unknown };
  const parts: string[] = [];
  if (typeof e?.code === "string") parts.push(e.code);
  if (typeof e?.responseCode === "number") parts.push(`SMTP ${e.responseCode}`);
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  // Mask anything that looks like an e-mail address.
  const masked = firstLine.replace(/[^\s@<>]+@[^\s@<>]+/g, "<redacted>");
  if (masked) parts.push(masked);
  return (parts.join(": ") || "Unbekannter Fehler").slice(0, 500);
}

export type SendListMailInput = {
  subject: string;
  body: string;
  /** Recipient addresses, already cleaned by `collectEmails` (src/lib/export.ts). */
  recipients: string[];
  /** Recorded in `mail_log.sent_by` (display name or e-mail from the session). */
  sentBy: string;
  /** Origin list, or null for a table-selection send. Recorded in `mail_log.list_id`. */
  listId?: number | null;
};

export type SendListMailResult =
  | {
      ok: true;
      chunks: number;
      recipientCount: number;
      /** Addresses the mail server refused at RCPT time while accepting the rest (no retry). */
      refused: number;
    }
  | {
      ok: false;
      /** Sanitized error (no recipient addresses) — safe for the log and the toast. */
      error: string;
      /** Recipients the server accepted before the failure (0 = nothing went out). */
      sent: number;
      recipientCount: number;
    };

/**
 * The user-facing German message for a failed mailing. After a partial send the earlier
 * chunks are already delivered, so the message must stop the natural reflex of clicking
 * "Senden" again, which would mail those recipients twice. Pure, for the action and tests.
 */
export function mailFailureMessage(result: { error: string; sent: number; recipientCount: number }): string {
  if (result.sent > 0) {
    return (
      `Versand abgebrochen: ${result.sent} von ${result.recipientCount} Empfängern haben die E-Mail ` +
      `bereits erhalten. Bitte nicht noch einmal an alle senden. (Fehler: ${result.error})`
    );
  }
  return `E-Mail-Versand fehlgeschlagen: ${result.error}`;
}

/**
 * Send one plaintext mailing to `recipients` via SMTP, split into BCC chunks of
 * `MAIL_BCC_CHUNK_SIZE`. `To:` is `MAIL_FROM` so recipients never see each other.
 * Counts delivered recipients chunk by chunk, so a failure midway reports how many
 * already got the mail. A chunk can also go out while the server refuses single
 * addresses (nodemailer then resolves and lists them in `rejected`); those are counted
 * as refused, not delivered. Writes exactly one `mail_log` row per mailing (not per chunk)
 * for both outcomes; a failing log write is only logged to the console and never turns
 * a delivered mailing into a reported failure.
 */
export async function sendListMail(input: SendListMailInput): Promise<SendListMailResult> {
  const from = process.env.MAIL_FROM?.trim();
  const host = process.env.SMTP_HOST?.trim();
  const recipientCount = input.recipients.length;
  if (!from || !host)
    return { ok: false, error: "Das Mail-Modul ist nicht konfiguriert.", sent: 0, recipientCount };
  if (recipientCount === 0)
    return { ok: false, error: "Keine Empfänger mit E-Mail-Adresse.", sent: 0, recipientCount };

  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ?? "";

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    // When credentials are sent over a non-implicit-TLS port (STARTTLS on 587), require
    // STARTTLS: nodemailer then refuses to send rather than falling back to plaintext, so
    // credentials never travel in the clear. Auth-less relays (Mailpit in dev, internal
    // servers) often offer no STARTTLS at all and must still work.
    ...(!secure && user ? { requireTLS: true } : {}),
    // Auth-less relays must get no auth block at all — an empty user/pass pair makes
    // some transports misbehave.
    ...(user ? { auth: { user, pass } } : {}),
    // Without timeouts a dead SMTP server would hang the server action forever.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });

  const chunks = chunk(input.recipients, bccChunkSize());
  let sent = 0;
  let refused = 0;
  let failure: string | null = null;
  try {
    for (const bcc of chunks) {
      const info = await transport.sendMail({
        from,
        to: from,
        bcc,
        subject: input.subject,
        text: input.body,
      });
      const refusedHere = countRefused(bcc, info?.rejected);
      sent += bcc.length - refusedHere;
      refused += refusedHere;
    }
  } catch (err) {
    // SMTP rejections often echo recipient addresses (PII). Sanitize once and use the same
    // masked string for the log AND the result — the raw error must never reach the client.
    failure = sanitizeMailError(err);
  } finally {
    transport.close();
  }
  // Every RCPT refused (e.g. "Relay access denied"): nodemailer resolves because `To:`
  // (our own address) was accepted, but nobody got the mail.
  if (failure == null && sent === 0) failure = "Der Mailserver hat alle Empfänger abgelehnt.";

  // Counts only, never the refused addresses themselves (PII).
  const refusedNote = refused > 0 ? `${refused} von ${recipientCount} Empfängern vom Mailserver abgelehnt` : null;
  await writeMailLog({
    sentBy: input.sentBy,
    listId: input.listId ?? null,
    subject: input.subject,
    recipientCount,
    status: failure == null ? "sent" : "failed",
    error:
      failure == null
        ? refusedNote
        : sent > 0
          ? `Abgebrochen nach ${sent} von ${recipientCount} Empfängern: ${failure}`
          : failure,
  });

  if (failure != null) return { ok: false, error: failure, sent, recipientCount };
  return { ok: true, chunks: chunks.length, recipientCount, refused };
}

/** How many of a chunk's BCC addresses the server refused (nodemailer's `info.rejected`). */
function countRefused(bcc: string[], rejected: unknown): number {
  if (!Array.isArray(rejected) || rejected.length === 0) return 0;
  const refusedSet = new Set(
    rejected.map((r) => (typeof r === "string" ? r : String((r as { address?: unknown })?.address ?? "")).toLowerCase()),
  );
  return bcc.filter((a) => refusedSet.has(a.toLowerCase())).length;
}

/** Insert the `mail_log` row; a DB error here is logged, never thrown (the mail is already out). */
async function writeMailLog(row: typeof mailLog.$inferInsert): Promise<void> {
  try {
    await db.insert(mailLog).values(row);
  } catch (err) {
    console.error("mail_log insert failed", err);
  }
}
