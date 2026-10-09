"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { sendMail, type SendMailResult } from "@/actions/mail";
import { FormLabel } from "@/components/form-label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const SUBJECT_MAX = 200;
const BODY_MAX = 50000;

/** "1 E-Mail-Adresse" / "25 E-Mail-Adressen" — the one wording for address counts. */
export const emailAddressCount = (n: number) =>
  `${n} ${n === 1 ? "E-Mail-Adresse" : "E-Mail-Adressen"}`;

/** Whether the mailing targets a whole list or an explicit table selection. */
export type ComposeTarget = { kind: "list"; listId: number } | { kind: "selection"; personIds: number[] };

/**
 * Plaintext compose dialog shared by the Verteiler detail and the directory
 * selection bar. The recipient counts shown here are a preview from data the
 * client already has (same `collectEmails` rule as the send); the server action
 * recomputes the effective set on send.
 */
export function ComposeMailDialog({
  open,
  onOpenChange,
  target,
  contextName,
  recipientCount,
  skippedCount,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ComposeTarget;
  /** Verteiler name or "die Auswahl" — shown in the dialog description. */
  contextName: string;
  /** Distinct recipients with a valid e-mail (preview only). */
  recipientCount: number;
  /** Persons without a valid e-mail address that will be skipped. */
  skippedCount: number;
  onSent?: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  // Second-stage guard before the irreversible send.
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  /** The one way out: Esc, X, „Abbrechen“ and a finished send all drop the draft. */
  function close() {
    onOpenChange(false);
    setSubject("");
    setBody("");
    setConfirming(false);
  }

  /**
   * Part of the mailing may already be out. Keep the warning until it is read and close
   * the dialog, so „Senden“ is not one click away from a double mailing.
   */
  function warnPartial(message: string, description?: string) {
    toast.error(message, {
      description,
      duration: Infinity,
      action: { label: "Verstanden", onClick: () => {} },
    });
    close();
  }

  function submit() {
    const payload =
      target.kind === "list"
        ? { listId: target.listId, subject, body }
        : { personIds: target.personIds, subject, body };
    startTransition(async () => {
      let res: SendMailResult;
      try {
        res = await sendMail(payload);
      } catch {
        // The request itself failed (connection drop, proxy timeout) while the server
        // may still be sending: treat it like a partial delivery.
        warnPartial(
          "Verbindung unterbrochen – die E-Mail ist womöglich schon bei einem Teil der Empfänger angekommen.",
          "Sende sie nicht einfach noch einmal." +
            (target.kind === "list"
              ? " Nach dem Neuladen siehst du unter „Zuletzt versendet“, ob der Versand durchgelaufen ist."
              : ""),
        );
        return;
      }
      if (!res.ok) {
        if (res.sent) warnPartial(res.message);
        else {
          toast.error(res.message);
          setConfirming(false);
        }
        return;
      }
      toast.success(`Rundmail an ${emailAddressCount(res.recipientCount)} versendet.`, {
        description:
          res.refused > 0
            ? `Der Mailserver hat ${emailAddressCount(res.refused)} abgelehnt.`
            : undefined,
      });
      close();
      onSent?.();
    });
  }

  const canSend =
    recipientCount > 0 && subject.trim().length > 0 && body.trim().length > 0 && !isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // While sending, the dialog stays put: closing it would hide the outcome.
        if (!o && !isPending) close();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>E-Mail schreiben</DialogTitle>
          <DialogDescription>
            Rundmail an {contextName}. Alle Empfänger stehen im BCC – sie sehen sich
            gegenseitig nicht.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <FormLabel htmlFor="mail-subject">Betreff</FormLabel>
            <Input
              id="mail-subject"
              autoFocus
              maxLength={SUBJECT_MAX}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Betreff der Rundmail"
            />
          </div>
          <div>
            <FormLabel htmlFor="mail-body">Nachricht</FormLabel>
            <Textarea
              id="mail-body"
              maxLength={BODY_MAX}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Nur Text – keine Formatierung, keine Anhänge."
              className="h-48 resize-y"
            />
          </div>
          <p className="rounded-md border border-line bg-surface-2 px-3 py-2 text-caption text-ink-soft">
            {recipientCount > 0 ? (
              <>
                an <span className="font-medium text-ink">{emailAddressCount(recipientCount)}</span>
                {skippedCount > 0
                  ? ` · ${skippedCount} ${
                      skippedCount === 1
                        ? "Person ohne gültige E-Mail wird"
                        : "Personen ohne gültige E-Mail werden"
                    } übersprungen`
                  : null}
              </>
            ) : (
              "Keine Empfänger mit gültiger E-Mail-Adresse."
            )}
          </p>
        </div>
        {confirming ? (
          <p
            role="status"
            className="rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-ui text-ink"
          >
            Wirklich an <span className="font-medium">{emailAddressCount(recipientCount)}</span> senden? Der
            Versand lässt sich nicht rückgängig machen.
          </p>
        ) : null}
        <DialogFooter>
          {confirming ? (
            <>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={isPending}>
                Zurück
              </Button>
              <Button onClick={submit} disabled={!canSend}>
                <Send />
                {isPending ? "Wird gesendet …" : `Jetzt an ${emailAddressCount(recipientCount)} senden`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                Abbrechen
              </Button>
              <Button onClick={() => setConfirming(true)} disabled={!canSend}>
                <Send />
                Senden …
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
