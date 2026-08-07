"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Button } from "@/components/ui/button";
import type { HistoricalAssignment } from "@/db/queries";

// --- "Frühere Ämter" — dezenter, einklappbarer Historienabschnitt ---------------

export function HistorySection({
  historical,
  open,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
  range,
  busy,
}: {
  historical: HistoricalAssignment[];
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onEdit: (h: HistoricalAssignment) => void;
  onDelete: (id: number) => void;
  range: (h: HistoricalAssignment) => string;
  busy: boolean;
}) {
  // Confirm before the irreversible delete (deleteAssignment fires immediately).
  const [confirmTarget, setConfirmTarget] = useState<HistoricalAssignment | null>(null);
  const targetLabel = confirmTarget
    ? `${confirmTarget.officeName ?? "ohne Amt"} · ${confirmTarget.groupName} · ${range(confirmTarget)}`
    : "";

  return (
    <div className="mt-4 border-t border-line pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        Frühere Ämter
        {historical.length > 0 ? (
          <span className="font-normal text-ink-faint">({historical.length})</span>
        ) : null}
      </button>
      {open ? (
        <div className="mt-2.5 flex flex-col gap-1.5">
          {historical.length === 0 ? (
            <p className="text-xs text-ink-faint">Keine früheren Ämter erfasst.</p>
          ) : (
            historical.map((h) => (
              <div
                key={h.id}
                className="group/hist flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[13px]"
              >
                <span className="min-w-0 text-ink-soft">
                  {h.officeName ? (
                    <span className="text-ink">{h.officeName}</span>
                  ) : (
                    <span className="italic">ohne Amt</span>
                  )}
                  <span className="text-ink-faint"> · {h.groupName} · </span>
                  <span className="tabular-nums">{range(h)}</span>
                </span>
                {/* Always visible on touch (no :hover, and tapping a plain row
                    focuses nothing) — hover-reveal only from sm: up. */}
                <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/hist:opacity-100 sm:group-focus-within/hist:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Bearbeiten"
                    disabled={busy}
                    onClick={() => onEdit(h)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Eintrag löschen"
                    disabled={busy}
                    className="text-ink-faint hover:text-crit"
                    onClick={() => setConfirmTarget(h)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </div>
            ))
          )}
          <button
            type="button"
            onClick={onAdd}
            disabled={busy}
            className="mt-1 inline-flex items-center gap-1 self-start text-[13px] text-ink-soft transition-colors hover:text-fir disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            Früheres Amt hinzufügen
          </button>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={confirmTarget != null}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
        title="Früheres Amt löschen?"
        description={
          <>
            Der Eintrag „{targetLabel}“ wird endgültig aus der Historie entfernt. Diese Aktion
            kann nicht rückgängig gemacht werden.
          </>
        }
        confirmLabel="Endgültig löschen"
        pending={busy}
        onConfirm={() => {
          if (confirmTarget) onDelete(confirmTarget.id);
          setConfirmTarget(null);
        }}
      />
    </div>
  );
}
