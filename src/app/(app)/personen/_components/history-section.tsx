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
import { ComboField, FormError, TextField, focusSoon } from "@/components/field";
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
import { callAction } from "@/lib/call-action";
import { NO_OFFICE, tenureRange, todayIso } from "@/lib/format";
import { TOUCH_HIT, cn } from "@/lib/utils";

import { EndDateChoice } from "./end-date";
import { GROUP_PICKER, NONE, OFFICE_PICKER, isEndChoiceReady, type EndChoice } from "./form-values";

// "Frühere Ämter": ended tenures. Unlike the rows above they are written immediately —
// they are already history, so there is nothing to buffer until Speichern. Each action
// checks the editor's concurrency token and hands back the new one, and revalidates the
// page, so the list follows at once.

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

/** The edit draft of a stored tenure. */
const draftFrom = (h: HistoricalAssignment): Draft => ({
  id: h.id,
  groupId: h.groupId,
  officeId: h.officeId,
  startDate: h.startDate ?? "",
  // An "Ende unbekannt" entry stores a synthetic end date (the recording day); the
  // checkbox stands for it, not the date field.
  end: { endDate: h.endUnknown ? "" : (h.endDate ?? ""), endUnknown: h.endUnknown },
});

export function HistorySection({
  personId,
  historical,
  version,
  onVersion,
  groupOptions,
  officeOptions,
}: {
  personId: number;
  historical: HistoricalAssignment[];
  /** The editor's concurrency token: sent with every write, replaced by the returned one. */
  version: string;
  onVersion: (version: string) => void;
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
      const res = await callAction(() => deleteAssignment({ assignmentId: removing.id, updatedAt: version }));
      if (!res.ok) return void toast.error(res.message);
      onVersion(res.updatedAt);
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
              {historical.map((h) => {
                const office = h.officeName ?? NO_OFFICE;
                return (
                  <li key={h.id} className="group/row flex items-center gap-2 px-2.5 py-1.5 text-ui">
                    <span className="min-w-0 flex-1 text-ink-soft">
                      <span className="text-ink">{office}</span>
                      {" · "}
                      {h.groupName}
                      <span className="block text-caption text-ink-faint tabular-nums sm:inline">
                        <span className="max-sm:hidden"> · </span>
                        {tenureRange(h)}
                      </span>
                    </span>
                    {/* A mouse sees the actions on hover or focus within the row; touch screens
                        have no hover, so there they stay visible. */}
                    <span className="flex shrink-0 items-center gap-0.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Bearbeiten: ${office} · ${h.groupName}`}
                        title="Bearbeiten"
                        className="text-ink-faint"
                        onClick={() => setDraft(draftFrom(h))}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Löschen: ${office} · ${h.groupName}`}
                        title="Löschen"
                        className="text-ink-faint hover:text-crit"
                        onClick={() => setRemoving(h)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </span>
                  </li>
                );
              })}
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
              version={version}
              onVersion={onVersion}
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
              „{removing.officeName ?? NO_OFFICE} · {removing.groupName} · {tenureRange(removing)}“
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
  version,
  onVersion,
  initial,
  groupOptions,
  officeOptions,
  onDone,
}: {
  personId: number;
  version: string;
  onVersion: (version: string) => void;
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
    // A refused submit moves focus to the first marked field, so its error is read out.
    if (draft.groupId == null) return focusSoon("hist-group");
    if (!isEndChoiceReady(draft.end, draft.startDate)) return focusSoon("hist-end");
    const values = {
      updatedAt: version,
      groupId: draft.groupId,
      officeId: draft.officeId,
      startDate: draft.startDate || null,
      endDate: draft.end.endUnknown ? null : draft.end.endDate,
      endUnknown: draft.end.endUnknown,
    };
    startTransition(async () => {
      const id = draft.id;
      const res = await callAction(() =>
        id != null
          ? updateHistoricalAssignment({ assignmentId: id, ...values })
          : addHistoricalAssignment({ personId, ...values }),
      );
      if (!res.ok) return void setServerError(res.message);
      onVersion(res.updatedAt);
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
          {...GROUP_PICKER}
        />
        <ComboField
          label="Amt"
          id="hist-office"
          options={officeOptions}
          value={draft.officeId != null ? String(draft.officeId) : null}
          onChange={(v) => setDraft({ ...draft, officeId: v === NONE ? null : Number(v) })}
          {...OFFICE_PICKER}
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
        <FormError>{serverError}</FormError>
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
