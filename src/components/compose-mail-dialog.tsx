"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { sendMail } from "@/actions/mail";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SUBJECT_MAX = 200;
const BODY_MAX = 50000;

/** Whether the mailing targets a whole list or an explicit table selection. */
export type ComposeTarget = { kind: "list"; listId: number } | { kind: "selection"; personIds: number[] };

/**
 * Plaintext compose dialog shared by the Verteiler detail and the directory
 * selection bar. The recipient counts shown here are a preview from data the
 * client already has; the server action recomputes the effective set on send.
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
  /** Distinct recipients with an e-mail (preview only). */
  recipientCount: number;
  /** Members/persons without an e-mail address that will be skipped. */
  skippedCount: number;
  onSent?: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setSubject("");
    setBody("");
  }

  function submit() {
    const payload =
      target.kind === "list"
        ? { listId: target.listId, subject, body }
        : { personIds: target.personIds, subject, body };
    startTransition(async () => {
      const res = await sendMail(payload);
      if (!res.ok) return void toast.error(res.message);
      toast.success(
        `E-Mail an ${res.recipientCount} ${res.recipientCount === 1 ? "Adresse" : "Adressen"} versendet` +
          (res.chunks > 1 ? ` (in ${res.chunks} Sendungen).` : "."),
      );
      onOpenChange(false);
      reset();
      onSent?.();
    });
  }

  const canSend =
    recipientCount > 0 && subject.trim().length > 0 && body.trim().length > 0 && !isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>E-Mail schreiben</DialogTitle>
          <DialogDescription>
            Rundmail an {contextName}. Alle Empfänger stehen im BCC — sie sehen sich
            gegenseitig nicht.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label
              htmlFor="mail-subject"
              className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-faint"
            >
              Betreff
            </Label>
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
            <Label
              htmlFor="mail-body"
              className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-faint"
            >
              Nachricht
            </Label>
            <Textarea
              id="mail-body"
              maxLength={BODY_MAX}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Nur Text — keine Formatierung, keine Anhänge."
              className="h-48 resize-y"
            />
          </div>
          <p className="rounded-md border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-soft">
            {recipientCount > 0 ? (
              <>
                an{" "}
                <span className="font-medium text-ink">
                  {recipientCount} {recipientCount === 1 ? "Adresse" : "Adressen"}
                </span>
                {skippedCount > 0 ? (
                  <>
                    {" · "}
                    {skippedCount}{" "}
                    {skippedCount === 1
                      ? "Mitglied ohne E-Mail wird"
                      : "Mitglieder ohne E-Mail werden"}{" "}
                    übersprungen
                  </>
                ) : null}
              </>
            ) : (
              "Keine Empfänger mit E-Mail-Adresse."
            )}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={!canSend}>
            <Send className="size-4" />
            {isPending ? "Wird gesendet …" : "Senden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
