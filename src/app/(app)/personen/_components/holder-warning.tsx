"use client";

import { useMemo } from "react";
import { TriangleAlert, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActiveHolder, ActiveOfficeHolder } from "@/db/queries";
import { formatDate } from "@/lib/format";

import { EndDateChoice, type AssignmentRow } from "./form-primitives";

// --- Amtsinhaber-Warnung (issue #26) -------------------------------------------

// Buffered "end this foreign tenure on save" orders, keyed by the target assignmentId.
// Nothing is written until savePerson runs them in its transaction.
export type EndPreviousOrder = {
  assignmentId: number;
  personId: number;
  name: string;
  endDate: string;
  endUnknown: boolean;
};

// The "Amtszeit von {Name} beenden…" dialog before an order is buffered.
export type HolderDialogState = {
  assignmentId: number;
  personId: number;
  name: string;
  endDate: string;
  endUnknown: boolean;
};

/**
 * Lookup over the active office holders the page preloaded (listActiveOfficeHolders).
 * Returns `otherHolders(a)`: the active holders of a row's office+group that are NOT the
 * person being edited — the ones the warning is about. A row needs an office AND a group
 * AND no "bis" date (an ended row is history, not a new assignment).
 */
export function useActiveHolders(holders: ActiveOfficeHolder[], personId: number | undefined) {
  const byCombo = useMemo(() => {
    const map = new Map<string, ActiveHolder[]>();
    for (const h of holders) {
      if (h.personId === personId) continue;
      const key = `${h.officeId}:${h.groupId}`;
      map.set(key, [...(map.get(key) ?? []), h]);
    }
    return map;
  }, [holders, personId]);

  return function otherHolders(a: AssignmentRow): ActiveHolder[] {
    if (a.groupId == null || a.officeId == null || a.endDate) return [];
    return byCombo.get(`${a.officeId}:${a.groupId}`) ?? [];
  };
}

/**
 * Warning banners for one assignment row: one per active foreign holder. A buffered
 * follow-up renders as an undoable chip instead of a warning.
 */
export function HolderWarning({
  holders,
  endPrevious,
  onStartEnd,
  onCancelEnd,
}: {
  holders: ActiveHolder[];
  endPrevious: Map<number, EndPreviousOrder>;
  onStartEnd: (h: ActiveHolder) => void;
  onCancelEnd: (assignmentId: number) => void;
}) {
  return holders.map((h) => {
    const order = endPrevious.get(h.assignmentId);
    if (order) {
      // A follow-up is buffered: show a chip with an undo, no more warning.
      return (
        <div
          key={h.assignmentId}
          className="mt-1.5 flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink-soft"
        >
          <span className="min-w-0">
            Amtszeit von <span className="font-medium text-ink">{order.name}</span> wird beendet
            <span className="text-ink-faint">
              {" · "}
              {order.endUnknown ? "Ende unbekannt" : formatDate(order.endDate)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onCancelEnd(h.assignmentId)}
            className="ml-auto inline-flex shrink-0 items-center gap-1 text-ink-faint transition-colors hover:text-ink"
          >
            <Undo2 className="size-3.5" />
            Rückgängig
          </button>
        </div>
      );
    }
    return (
      <div
        key={h.assignmentId}
        className="mt-1.5 flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink-soft"
      >
        <TriangleAlert className="size-3.5 shrink-0 text-ink-faint" />
        <span className="min-w-0">
          <span className="font-medium text-ink">{h.name}</span> hat dieses Amt aktuell inne
          {h.startDate ? ` (seit ${formatDate(h.startDate)})` : ""}.
        </span>
        <button
          type="button"
          onClick={() => onStartEnd(h)}
          className="ml-auto shrink-0 whitespace-nowrap font-medium text-fir transition-colors hover:underline"
        >
          Amtszeit von {h.name} beenden…
        </button>
      </div>
    );
  });
}

/** Holder warning dialog: buffer an "end previous tenure" order — written only on save. */
export function HolderDialog({
  dialog,
  onChange,
  onClose,
  onConfirm,
}: {
  dialog: HolderDialogState | null;
  onChange: (next: HolderDialogState) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={dialog != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Amtszeit von {dialog?.name} beenden</DialogTitle>
          <DialogDescription>
            Die Amtszeit wird erst beim <strong>Speichern</strong> beendet. Bis dahin lässt sich
            die Entscheidung rückgängig machen; brichst du das Formular ab, bleibt alles
            unverändert. Wähle „Ende unbekannt“, wenn das Ende nicht mehr bekannt ist.
          </DialogDescription>
        </DialogHeader>
        {dialog ? (
          <EndDateChoice
            idPrefix="f-holder"
            endDate={dialog.endDate}
            endUnknown={dialog.endUnknown}
            onDate={(v) => onChange({ ...dialog, endDate: v })}
            onUnknown={(v) => onChange({ ...dialog, endUnknown: v })}
          />
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={onConfirm} disabled={!dialog?.endUnknown && !dialog?.endDate}>
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
