"use server";

import { z } from "zod";

import { effectiveMemberIds, personEmailsByIds } from "@/db/queries";
import { SESSION_EXPIRED, firstError, getActionSession, revalidateApp } from "@/lib/action-helpers";
import { actorName } from "@/lib/auth-helpers";
import { collectEmails } from "@/lib/export";
import { BODY_MAX, IDS_MAX, SUBJECT_MAX } from "@/lib/limits";
import { isMailEnabled, mailFailureMessage, sendListMail } from "@/lib/mail";
import { rowId } from "@/lib/person-schema";

export type SendMailResult =
  | {
      ok: true;
      /** Recipients the mail server accepted (refused addresses are not included). */
      recipientCount: number;
      chunks: number;
      /** Addresses the mail server refused while accepting the rest. */
      refused: number;
    }
  | {
      ok: false;
      message: string;
      /**
       * Recipients who already got the mail before the failure. When > 0 the client must
       * not offer the same send again, or those recipients get it twice.
       */
      sent?: number;
    };

const composeSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "Betreff ist erforderlich.")
    .max(SUBJECT_MAX, `Betreff ist zu lang (max. ${SUBJECT_MAX} Zeichen).`)
    // A newline in the subject would end the SMTP header and let the rest of the
    // value inject arbitrary headers (Bcc:, …) — classic header injection.
    .refine((s) => !/[\r\n]/.test(s), "Der Betreff darf keine Zeilenumbrüche enthalten."),
  body: z
    .string()
    .trim()
    .min(1, "Nachricht ist erforderlich.")
    .max(BODY_MAX, `Nachricht ist zu lang (max. ${BODY_MAX.toLocaleString("de-DE")} Zeichen).`),
  // A send targets either a whole list (effective set) or an explicit selection.
  listId: rowId.nullish(),
  personIds: z.array(rowId).max(IDS_MAX, "Zu viele Personen ausgewählt.").nullish(),
});

type SendMailInput = z.infer<typeof composeSchema>;

/** A failure before anything went out (the client must not warn of a partial send). */
const NOTHING_SENT = {
  ok: false,
  message: "Der Server hat gerade ein Problem – es wurde nichts versendet. Bitte versuche es noch einmal.",
} as const;

/**
 * Send a plaintext mailing to a whole distribution list or a table selection.
 * The recipient set is ALWAYS recomputed server-side (effective membership for a
 * list, the living persons of the selection otherwise) — the client-supplied list is never
 * trusted.
 */
export async function sendMail(raw: SendMailInput): Promise<SendMailResult> {
  // Called without callAction (the client must tell a failed request from a partial send),
  // so a database error before sending is answered here, not thrown.
  let session: Awaited<ReturnType<typeof getActionSession>>;
  try {
    session = await getActionSession();
  } catch (err) {
    console.error("sendMail: session lookup failed", err);
    return NOTHING_SENT;
  }
  if (!session) return SESSION_EXPIRED;
  // Defense in depth: the UI hides the buttons when the module is off, but the
  // action re-checks so a stale client or a direct call still cannot send.
  if (!isMailEnabled()) return { ok: false, message: "Das Mail-Modul ist nicht aktiv." };

  const parsed = composeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const { subject, body, listId, personIds } = parsed.data;

  if (listId == null && !personIds?.length) return { ok: false, message: "Kein Verteiler und keine Auswahl angegeben." };

  let emails: (string | null)[];
  try {
    emails =
      listId != null
        ? // Effective members (manual ∪ rules, living persons only).
          await personEmailsByIds(await effectiveMemberIds(listId))
        : // Explicit selection: the chosen persons (the query drops deceased ones).
          await personEmailsByIds([...new Set(personIds)]);
  } catch (err) {
    // Only reads above — keep sending out of this try: "nothing was sent" must stay true
    // (otherwise the client's "maybe partly sent" warning is the honest answer).
    console.error("sendMail: loading recipients failed", err);
    return NOTHING_SENT;
  }

  // Same rule as the compose preview and the clipboard copy (collectEmails), so the
  // count the user confirmed is the count that goes out.
  const { recipients } = collectEmails(emails);
  if (recipients.length === 0) return { ok: false, message: "Keine Empfänger mit gültiger E-Mail-Adresse." };

  const result = await sendListMail({
    subject,
    body,
    recipients,
    sentBy: actorName(session),
    listId: listId ?? null,
  });

  // Refresh the "Zuletzt versendet" card regardless of outcome (failures are logged too).
  revalidateApp();

  if (!result.ok) return { ok: false, message: mailFailureMessage(result), sent: result.sent };
  return {
    ok: true,
    recipientCount: result.recipientCount - result.refused,
    chunks: result.chunks,
    refused: result.refused,
  };
}
