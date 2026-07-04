"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { effectiveMemberIds, personEmailsByIds } from "@/db/queries";
import { actorName, requireSession } from "@/lib/auth-helpers";
import { isMailEnabled, normalizeRecipients, sendListMail } from "@/lib/mail";

export type SendMailResult =
  | { ok: true; recipientCount: number; chunks: number }
  | { ok: false; message: string };

const composeSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "Betreff ist erforderlich.")
    .max(200, "Betreff ist zu lang (max. 200 Zeichen)."),
  body: z
    .string()
    .trim()
    .min(1, "Nachricht ist erforderlich.")
    .max(50000, "Nachricht ist zu lang (max. 50.000 Zeichen)."),
  // A send targets either a whole list (effective set) or an explicit selection.
  listId: z.number().int().positive().nullish(),
  personIds: z.array(z.number().int().positive()).nullish(),
});

export type SendMailInput = z.infer<typeof composeSchema>;

function firstError(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Ungültige Eingabe.";
}

/**
 * Send a plaintext mailing to a whole distribution list or a table selection.
 * The recipient set is ALWAYS recomputed server-side (effective membership for a
 * list, the selection as-is otherwise) — the client-supplied list is never trusted.
 */
export async function sendMail(raw: SendMailInput): Promise<SendMailResult> {
  const session = await requireSession();
  // Defense in depth: the UI hides the buttons when the module is off, but the
  // action re-checks so a stale client or a direct call still cannot send.
  if (!isMailEnabled()) return { ok: false, message: "Das Mail-Modul ist nicht aktiv." };

  const parsed = composeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const { subject, body, listId, personIds } = parsed.data;

  let emails: (string | null)[];
  if (listId != null) {
    // Effective members (manual ∪ rule, deceased excluded from the rule half).
    const ids = await effectiveMemberIds(listId);
    emails = await personEmailsByIds(ids);
  } else if (personIds && personIds.length > 0) {
    // Explicit selection: send to exactly the chosen persons (deceased kept).
    emails = await personEmailsByIds([...new Set(personIds)]);
  } else {
    return { ok: false, message: "Kein Verteiler und keine Auswahl angegeben." };
  }

  const { recipients } = normalizeRecipients(emails);
  if (recipients.length === 0) return { ok: false, message: "Keine Empfänger mit E-Mail-Adresse." };

  const result = await sendListMail({
    subject,
    body,
    recipients,
    sentBy: actorName(session),
    listId: listId ?? null,
  });

  // Refresh the "Zuletzt versendet" card regardless of outcome (failures are logged too).
  revalidatePath("/verteiler");

  if (!result.ok) return { ok: false, message: `E-Mail-Versand fehlgeschlagen: ${result.error}` };
  return { ok: true, recipientCount: result.recipientCount, chunks: result.chunks };
}
