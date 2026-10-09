"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  addHistoricalAssignment,
  deleteAssignment,
  updateHistoricalAssignment,
} from "@/actions/assignments";
import { AddRowButton } from "@/components/add-row-button";
import type { ComboOption } from "@/components/combobox";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HistoricalAssignment } from "@/db/queries";
import { formatDate, todayIso } from "@/lib/format";
import { HOVER_REVEAL, TOUCH_HIT, cn } from "@/lib/utils";

import { EndDateChoice } from "./end-date";
import { ComboField, TextField } from "./field";
import { NONE, isEndChoiceReady, type EndChoice } from "./form-values";

// "Frühere Ämter": ended tenures. Unlike the rows above they are written immediately —
// they are already history, so there is nothing to buffer until Speichern. Each action
// revalidates the page, so the list (and the editor's concurrency token) follow at once.

/** "01.01.2015 – 31.12.2019", "01.01.2015 – Ende unbekannt", "bis 31.12.2019", "Ende unbekannt". */
function historyRange(h: HistoricalAssignment): string {
  const from = formatDate(h.startDate);
  const to = h.endUnknown ? "Ende unbekannt" : formatDate(h.endDate);
  if (from) return `${from} – ${to}`;
  return h.endUnknown ? to : `bis ${to}`;
}

type Draft = {
  /** Tenure being edited; null for a new one. */
  id: number | null;
  groupId: number | null;
  officeId: number | null;
  startDate: string;
  end: EndChoice;
};

const NEW_DRAFT: Draft = {
  id: null,
  groupId: null,
  officeId: null,
  startDate: "",
  end: { endDate: "", endUnknown: false },
};

export function HistorySection({
  personId,
  historical,
  groupOptions,
  officeOptions,
}: {
  personId: number;
  historical: HistoricalAssignment[];
  groupOptions: ComboOption[];
  officeOptions: ComboOption[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<HistoricalAssignment | null>(null);
  const [isRemoving, startRemove] = useTransition();

  function remove() {
    if (!removing) return;
    startRemove(async () => {
      const res = await deleteAssignment({ assignmentId: removing.id });
      if (!res.ok) return void toast.error(res.message);
      setRemoving(null);
      toast.success("Früheres Amt gelöscht.");
    });
  }

  return (
    <div className="mt-gutter border-t border-line pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          TOUCH_HIT,
          "flex items-center gap-1.5 rounded-sm text-ui font-medium text-ink-soft transition-colors hover:text-ink",
        )}
      >
        <ChevronRight aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        Frühere Ämter
        <span className="font-normal text-ink-faint tabular-nums">({historical.length})</span>
      </button>

      {open ? (
        <div className="mt-2.5">
          {historical.length === 0 ? (
            <p className="mb-2.5 text-caption text-ink-faint">Noch keine früheren Ämter erfasst.</p>
          ) : (
            <ul className="mb-2.5 divide-y divide-line rounded-md border border-line">
              {historical.map((h) => (
                <li key={h.id} className="group/row flex items-center gap-2 px-2.5 py-1.5 text-ui">
                  <span className="min-w-0 flex-1 text-ink-soft">
                    <span className="text-ink">{h.officeName ?? "Ohne Amt"}</span>
                    {" · "}
                    {h.groupName}
                    <span className="block text-caption text-ink-faint tabular-nums sm:inline">
                      <span className="max-sm:hidden"> · </span>
                      {historyRange(h)}
                    </span>
                  </span>
                  <span className={cn("flex shrink-0 items-center gap-0.5", HOVER_REVEAL)}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Früheres Amt bearbeiten"
                      title="Bearbeiten"
                      className="text-ink-faint"
                      onClick={() =>
                        setDraft({
                          id: h.id,
                          groupId: h.groupId,
                          officeId: h.officeId,
                          startDate: h.startDate ?? "",
                          // An "Ende unbekannt" entry stores a synthetic end date (the
                          // recording day); the checkbox stands for it, not the date field.
                          end: { endDate: h.endUnknown ? "" : (h.endDate ?? ""), endUnknown: h.endUnknown },
                        })
                      }
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Früheres Amt löschen"
                      title="Löschen"
                      className="text-ink-faint hover:text-crit"
                      onClick={() => setRemoving(h)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <AddRowButton onClick={() => setDraft(NEW_DRAFT)}>Früheres Amt hinzufügen</AddRowButton>
        </div>
      ) : null}

      <Dialog open={draft != null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          {draft ? (
            <HistoryForm
              personId={personId}
              initial={draft}
              groupOptions={groupOptions}
              officeOptions={officeOptions}
              onDone={() => setDraft(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={removing != null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Früheres Amt löschen?"
        description={
          removing ? (
            <>
              „{removing.officeName ?? "Ohne Amt"} · {removing.groupName} · {historyRange(removing)}“
              wird endgültig aus der Historie entfernt. Das lässt sich nicht rückgängig machen.
            </>
          ) : null
        }
        confirmLabel="Endgültig löschen"
        pending={isRemoving}
        onConfirm={remove}
      />
    </div>
  );
}

/** Add or edit one ended tenure. Mounted per opening, so it starts from `initial`. */
function HistoryForm({
  personId,
  initial,
  groupOptions,
  officeOptions,
  onDone,
}: {
  personId: number;
  initial: Draft;
  groupOptions: ComboOption[];
  officeOptions: ComboOption[];
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isNew = draft.id == null;

  const groupError = tried && draft.groupId == null ? "Bitte eine Gliederung wählen." : undefined;
  const endMissing = tried && !draft.end.endUnknown && !draft.end.endDate;

  function submit() {
    setTried(true);
    if (draft.groupId == null || !isEndChoiceReady(draft.end, draft.startDate)) return;
    const values = {
      groupId: draft.groupId,
      officeId: draft.officeId,
      startDate: draft.startDate || null,
      endDate: draft.end.endUnknown ? null : draft.end.endDate,
      endUnknown: draft.end.endUnknown,
    };
    startTransition(async () => {
      const res =
        draft.id != null
          ? await updateHistoricalAssignment({ assignmentId: draft.id, ...values })
          : await addHistoricalAssignment({ personId, ...values });
      if (!res.ok) return void setServerError(res.message);
      toast.success(isNew ? "Früheres Amt hinzugefügt." : "Früheres Amt gespeichert.");
      onDone();
    });
  }

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        // Portalled, but React still bubbles the submit to the person form around it.
        e.stopPropagation();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{isNew ? "Früheres Amt hinzufügen" : "Früheres Amt bearbeiten"}</DialogTitle>
        <DialogDescription>
          Ein bereits beendetes Amt, zum Beispiel für die Vorgeschichte. Wird sofort gespeichert.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <ComboField
          label="Gliederung"
          id="hist-group"
          error={groupError}
          options={groupOptions}
          value={draft.groupId != null ? String(draft.groupId) : null}
          onChange={(v) => setDraft({ ...draft, groupId: Number(v) })}
          placeholder="Gliederung wählen"
          searchPlaceholder="Gliederung suchen …"
          emptyText="Keine Gliederung gefunden."
        />
        <ComboField
          label="Amt"
          id="hist-office"
          options={officeOptions}
          value={draft.officeId != null ? String(draft.officeId) : null}
          onChange={(v) => setDraft({ ...draft, officeId: v === NONE ? null : Number(v) })}
          placeholder="Kein Amt"
          searchPlaceholder="Amt suchen …"
          emptyText="Kein Amt gefunden."
        />
        <TextField
          label="Von"
          id="hist-from"
          type="date"
          max={todayIso()}
          hint="Optional."
          value={draft.startDate}
          onValueChange={(v) => setDraft({ ...draft, startDate: v })}
        />
        <EndDateChoice
          id="hist-end"
          value={draft.end}
          onChange={(end) => setDraft({ ...draft, end })}
          start={draft.startDate || null}
          error={endMissing ? "Bitte gib ein Bis-Datum an oder wähle „Ende unbekannt“." : undefined}
        />
        {serverError ? (
          <p role="alert" className="text-caption text-crit">
            {serverError}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Speichern …" : "Speichern"}
        </Button>
      </DialogFooter>
    </form>
  );
}
