"use client";

import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";

import type { ActiveHolder, ActiveOfficeHolder } from "@/db/queries";
import { formatDate } from "@/lib/format";

import { EndingNote, NoteButton, RowNote, endingText } from "./end-date";
import type { AssignmentRow, EndPreviousOrder } from "./form-values";

// --- Amtsinhaber-Warnung (issue #26) -------------------------------------------

/**
 * Lookup over the active office holders the page preloaded (listActiveOfficeHolders).
 * Returns `otherHolders(row)`: the current holders of a row's Amt in its Gliederung other
 * than the person being edited — the ones the warning is about. A row needs both an Amt
 * and a Gliederung, and must not be ending itself.
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

  return function otherHolders(row: AssignmentRow): ActiveHolder[] {
    if (row.groupId == null || row.officeId == null || row.end) return [];
    return byCombo.get(`${row.officeId}:${row.groupId}`) ?? [];
  };
}

/**
 * One note per current holder of the row's Amt: a warning with "Amtszeit beenden …", or —
 * once the user chose to end it — the buffered ending with an undo.
 */
export function HolderNotes({
  holders,
  orders,
  onEnd,
  onUndo,
}: {
  holders: ActiveHolder[];
  orders: EndPreviousOrder[];
  onEnd: (holder: ActiveHolder) => void;
  onUndo: (assignmentId: number) => void;
}) {
  return holders.map((h) => {
    const order = orders.find((o) => o.assignmentId === h.assignmentId);
    return order ? (
      <EndingNote key={h.assignmentId} undoId={`h-${h.assignmentId}-undo`} onUndo={() => onUndo(h.assignmentId)}>
        Amtszeit von <span className="font-medium text-ink">{h.name}</span> {endingText(order)}
      </EndingNote>
    ) : (
      <RowNote
        key={h.assignmentId}
        icon={TriangleAlert}
        action={
          <NoteButton id={`h-${h.assignmentId}-end`} onClick={() => onEnd(h)} className="text-fir hover:underline">
            Amtszeit beenden …
          </NoteButton>
        }
      >
        <span className="font-medium text-ink">{h.name}</span> hat dieses Amt aktuell inne
        {h.startDate ? ` (seit ${formatDate(h.startDate)})` : ""}.
      </RowNote>
    );
  });
}
