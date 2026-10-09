"use client";

import { useState, useTransition } from "react";
import { Copy, Download, Send, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { addMembers } from "@/actions/lists";
import { Combobox } from "@/components/combobox";
import { ComposeMailDialog, emailAddressCount } from "@/components/compose-mail-dialog";
import { FormLabel } from "@/components/form-label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PersonListRow } from "@/db/queries";
import { callAction } from "@/lib/call-action";
import { downloadFile, toastDownloadError } from "@/lib/download";
import { personCount } from "@/lib/format";
import { LINK, TOUCH_HIT, cn } from "@/lib/utils";

import { mailSelection, skippedNote } from "./directory-filter";

/**
 * Bulk actions for the ticked persons. Sticks to the bottom of the viewport while
 * anything is selected, so it stays in reach far down the list. Says how many of the
 * selected persons the current filters hide — every action includes them.
 */
export function SelectionBar({
  className,
  selected,
  hiddenCount,
  onKeepVisible,
  onClear,
  distributionLists,
  mailEnabled,
}: {
  /** Placement in the parent's layout (e.g. its flex order). */
  className?: string;
  selected: PersonListRow[];
  /** Selected persons not shown under the current search and filters. */
  hiddenCount: number;
  onKeepVisible: () => void;
  onClear: () => void;
  distributionLists: { id: number; name: string }[];
  /** True when the optional mail module is configured (see isMailEnabled). */
  mailEnabled: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [csvPending, setCsvPending] = useState(false);

  const mail = mailSelection(selected);

  async function copyEmails() {
    const note = skippedNote(mail.deceased, mail.bcc.skipped);
    if (mail.bcc.count === 0) {
      toast.error(`Keine E-Mail-Adresse in der Auswahl${note ? ` (${note})` : ""}.`);
      return;
    }
    try {
      // Throws, not rejects, where the Clipboard API is missing (insecure origin).
      await navigator.clipboard.writeText(mail.bcc.text);
      toast.success(`${emailAddressCount(mail.bcc.count)} kopiert${note ? ` (${note}).` : "."}`);
    } catch {
      toast.error("Kopieren nicht möglich. Bitte versuche es noch einmal.");
    }
  }

  async function downloadCsv() {
    setCsvPending(true);
    try {
      await downloadFile(`/api/export/csv?ids=${selected.map((p) => p.id).join(",")}`, "anschriften.csv");
      toast.success("CSV heruntergeladen.");
    } catch (err) {
      toastDownloadError(err, "CSV-Export fehlgeschlagen. Bitte versuche es noch einmal.");
    } finally {
      setCsvPending(false);
    }
  }

  return (
    <>
      <div
        role="region"
        aria-label="Auswahl"
        className={cn(
          "sticky bottom-3 z-20 mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line-strong bg-surface px-3 py-2.5 shadow-[0_6px_24px_-8px_rgb(0_0_0/0.25)] sm:px-4",
          // While the bar is shown, the page's scroll padding keeps a row that gets
          // keyboard focus clear of it: its tallest wrap per breakpoint, plus air.
          "[html:has(&)]:scroll-pb-48 sm:[html:has(&)]:scroll-pb-36 xl:[html:has(&)]:scroll-pb-20",
          className,
        )}
      >
        <p className="order-1 min-w-0 flex-1 text-ui text-ink xl:flex-none">
          <span className="font-medium tabular-nums">{selected.length} ausgewählt</span>
          {hiddenCount > 0 ? (
            <>
              <span className="text-ink-soft">, davon {hiddenCount} ausgeblendet</span>
              <span className="max-sm:hidden"> · </span>
              <button
                type="button"
                onClick={onKeepVisible}
                className={cn(
                  TOUCH_HIT,
                  LINK,
                  "rounded-sm max-sm:mt-1 max-sm:block",
                )}
              >
                Nur sichtbare behalten
              </button>
            </>
          ) : null}
        </p>
        {/* Phones: count + "Auswahl aufheben" on top, actions below. From xl up: one row. */}
        <div className="order-3 flex w-full flex-wrap gap-2 xl:order-2 xl:w-auto">
          {mailEnabled ? (
            <Button size="sm" onClick={() => setComposeOpen(true)}>
              <Send />
              E-Mail schreiben …
            </Button>
          ) : null}
          <Button size="sm" variant={mailEnabled ? "outline" : "default"} onClick={copyEmails}>
            <Copy />
            E-Mail-Adressen kopieren
          </Button>
          {distributionLists.length > 0 ? (
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <UserPlus />
              Zu Verteiler hinzufügen …
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={downloadCsv} disabled={csvPending}>
            <Download />
            {csvPending ? "CSV wird erstellt …" : "CSV"}
          </Button>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Auswahl aufheben"
          className={cn(
            TOUCH_HIT,
            "order-2 ml-auto inline-flex items-center gap-1 rounded-sm text-caption text-ink-soft transition-colors hover:text-ink xl:order-3",
          )}
        >
          <X aria-hidden className="size-3.5" />
          {/* Phones: the short label keeps it on the count's line. */}
          <span className="sm:hidden">Aufheben</span>
          <span className="max-sm:hidden">Auswahl aufheben</span>
        </button>
      </div>

      <AddToListDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        personIds={selected.map((p) => p.id)}
        distributionLists={distributionLists}
      />

      {mailEnabled ? (
        <ComposeMailDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          target={{ kind: "selection", personIds: mail.personIds }}
          contextName={
            `die Auswahl (${personCount(mail.personIds.length)}` +
            (mail.deceased > 0 ? `; ${skippedNote(mail.deceased, 0)})` : ")")
          }
          recipientCount={mail.bcc.count}
          skippedCount={mail.bcc.skipped}
          onSent={onClear}
        />
      ) : null}
    </>
  );
}

function AddToListDialog({
  open,
  onOpenChange,
  personIds,
  distributionLists,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personIds: number[];
  distributionLists: { id: number; name: string }[];
}) {
  const [listId, setListId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) setListId(null);
  }

  function submit() {
    if (listId == null) return;
    const id = Number(listId);
    startTransition(async () => {
      const res = await callAction(() => addMembers(id, personIds));
      if (!res.ok) return void toast.error(res.message);
      const listName = distributionLists.find((l) => l.id === id)?.name ?? "Verteiler";
      const note = skippedNote(res.skippedDeceased, 0);
      toast.success(`${personCount(res.added)} zu „${listName}“ hinzugefügt${note ? ` (${note})` : ""}.`);
      close(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zu Verteiler hinzufügen</DialogTitle>
          <DialogDescription>
            {personCount(personIds.length)} {personIds.length === 1 ? "wird" : "werden"} dem
            gewählten Verteiler hinzugefügt. Bereits enthaltene Personen bleiben unverändert,
            verstorbene werden übersprungen.
          </DialogDescription>
        </DialogHeader>
        <div>
          <FormLabel htmlFor="add-to-list">Verteiler</FormLabel>
          <Combobox
            id="add-to-list"
            options={distributionLists.map((l) => ({ value: String(l.id), label: l.name }))}
            value={listId}
            onChange={setListId}
            placeholder="Verteiler wählen"
            searchPlaceholder="Verteiler suchen …"
            emptyText="Kein Verteiler gefunden."
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              Abbrechen
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={isPending || listId == null}>
            {isPending ? "Wird hinzugefügt …" : "Hinzufügen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
