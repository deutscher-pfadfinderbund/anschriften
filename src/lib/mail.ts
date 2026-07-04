// Optional mail module (issue #19). Active only when SMTP_HOST and MAIL_FROM are
// configured; otherwise `isMailEnabled()` is false, the UI hides all mail actions
// and the server action refuses. Provider-agnostic: a plain SMTP transport via
// nodemailer, so switching provider (own server, SES, Postmark, Brevo, Mailjet …)
// is a `.env` change with no code change. Plaintext only in v1 — no HTML, no
// attachments (YAGNI; keeps the abuse surface small).
import nodemailer from "nodemailer";

import { db } from "@/db";
import { mailLog } from "@/db/schema";

/**
 * True when the mail module is configured (SMTP host + From address present).
 * Read at call time — never captured at import — so restarting the server without
 * the SMTP vars really disables the module (see abnahme step 1).
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

export type NormalizedRecipients = {
  /** Deduplicated, trimmed, non-empty addresses in first-seen order. */
  recipients: string[];
  /** How many inputs were dropped because they had no (blank) address. */
  skipped: number;
};

/**
 * Turn raw person e-mails (some null/blank, possibly duplicated) into the actual
 * BCC recipient set: trim, drop blanks and malformed addresses (counted as
 * `skipped`), dedupe case-insensitively, preserve order.
 */
export function normalizeRecipients(emails: (string | null | undefined)[]): NormalizedRecipients {
  const seen = new Set<string>();
  const recipients: string[] = [];
  let skipped = 0;
  for (const raw of emails) {
    const e = (raw ?? "").trim();
    // The legacy email column is free text — entries like "a@x.de, b@y.de" or
    // stray notes exist. Anything that is not a single plausible address is
    // skipped (counted like "no e-mail") instead of being handed to SMTP.
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      skipped += 1;
      continue;
    }
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(e);
  }
  return { recipients, skipped };
}

export type SendListMailInput = {
  subject: string;
  body: string;
  /** Already-normalized recipient addresses (deduped, non-empty). */
  recipients: string[];
  /** Recorded in `mail_log.sent_by` (display name or e-mail from the session). */
  sentBy: string;
  /** Origin list, or null for a table-selection send. Recorded in `mail_log.list_id`. */
  listId?: number | null;
};

export type SendListMailResult =
  | { ok: true; chunks: number; recipientCount: number }
  | { ok: false; error: string };

/**
 * Send one plaintext mailing to `recipients` via SMTP, split into BCC chunks of
 * `MAIL_BCC_CHUNK_SIZE`. `To:` is `MAIL_FROM` so recipients never see each other.
 * Writes exactly one `mail_log` row per mailing (not per chunk), for both the
 * success and the failure path, and returns a plain result for the caller's toast.
 */
export async function sendListMail(input: SendListMailInput): Promise<SendListMailResult> {
  const from = process.env.MAIL_FROM?.trim();
  const host = process.env.SMTP_HOST?.trim();
  if (!from || !host) return { ok: false, error: "Das Mail-Modul ist nicht konfiguriert." };
  if (input.recipients.length === 0)
    return { ok: false, error: "Keine Empfänger mit E-Mail-Adresse." };

  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ?? "";

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    // Auth-less relays (Mailpit in dev, some internal servers) must get no auth
    // block at all — an empty user/pass pair makes some transports misbehave.
    ...(user ? { auth: { user, pass } } : {}),
    // Without timeouts a dead SMTP server would hang the server action forever.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });

  const chunks = chunk(input.recipients, bccChunkSize());
  const recipientCount = input.recipients.length;

  try {
    for (const bcc of chunks) {
      await transport.sendMail({
        from,
        to: from,
        bcc,
        subject: input.subject,
        text: input.body,
      });
    }
    await db.insert(mailLog).values({
      sentBy: input.sentBy,
      listId: input.listId ?? null,
      subject: input.subject,
      recipientCount,
      status: "sent",
      error: null,
    });
    return { ok: true, chunks: chunks.length, recipientCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(mailLog).values({
      sentBy: input.sentBy,
      listId: input.listId ?? null,
      subject: input.subject,
      recipientCount,
      status: "failed",
      error: message.slice(0, 2000),
    });
    return { ok: false, error: message };
  } finally {
    transport.close();
  }
}
