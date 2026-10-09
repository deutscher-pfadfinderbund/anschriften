"use client";

import { useMemo, useState } from "react";
import { CalendarOff, X } from "lucide-react";

import { AddRowButton } from "@/components/add-row-button";
import type { ComboOption } from "@/components/combobox";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import type { ActiveHolder, GroupRow, HistoricalAssignment, OfficeRow } from "@/db/queries";
import { orderGroups } from "@/lib/groups";
import type { FieldErrors } from "@/lib/person-schema";

import { EndDateDialog, EndingNote, endingText, type EndRequest } from "./end-date";
import { ComboField, TextField, focusSoon } from "./field";
import {
  GROUP_PICKER,
  NONE,
  OFFICE_PICKER,
  newKey,
  type AssignmentRow,
  type FormValues,
  type SetValue,
} from "./form-values";
import { HistorySection } from "./history-section";
import { HolderNotes } from "./holder-warning";

/** id of a row's control, e.g. "a-n3-group". */
const rowId = (row: AssignmentRow, part: "group" | "office" | "start" | "end" | "undo") => `a-${row.key}-${part}`;

/** "Ämter & Gliederungen": the active rows, their endings and holder warnings, plus the history. */
export function AssignmentsPanel({
  values,
  errors,
  set,
  groups,
  offices,
  otherHolders,
  history,
}: {
  values: FormValues;
  errors: FieldErrors;
  set: SetValue;
  groups: GroupRow[];
  offices: OfficeRow[];
  otherHolders: (row: AssignmentRow) => ActiveHolder[];
  /** Edit mode only: the ended tenures, and the editor's concurrency token they advance. */
  history: {
    personId: number;
    historical: HistoricalAssignment[];
    version: string;
    onVersion: (version: string) => void;
  } | null;
}) {
  const [ending, setEnding] = useState<EndRequest | null>(null);
  const rows = values.assignments;

  const groupOptions: ComboOption[] = useMemo(
    () => orderGroups(groups).map(({ group, depth }) => ({ value: String(group.id), label: group.name, depth })),
    [groups],
  );
  const officeOptions: ComboOption[] = useMemo(
    () => [
      { value: NONE, label: "Kein Amt (nur Mitglied)" },
      ...offices.map((o) => ({ value: String(o.id), label: o.name })),
    ],
    [offices],
  );
  const labelOf = (options: ComboOption[], id: number | null) =>
    options.find((o) => o.value === String(id))?.label;
  /** "Bundeskanzlerin · Bundeskanzlei": names the row for its dialog and its buttons. */
  const rowLabel = (row: AssignmentRow) =>
    [labelOf(officeOptions, row.officeId), labelOf(groupOptions, row.groupId)].filter(Boolean).join(" · ") ||
    "neue Zeile";

  /** Patch one row; `fields` are the error keys the change resolves. */
  function updateRow(key: string, patch: Partial<AssignmentRow>, fields: string[] = []) {
    set(
      "assignments",
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
      fields.map((f) => `${key}.${f}`),
    );
  }

  function addRow() {
    const key = newKey();
    set("assignments", [...rows, { key, id: null, groupId: null, officeId: null, startDate: "", end: null }]);
    focusSoon(`a-${key}-group`);
  }

  function removeRow(key: string) {
    set("assignments", rows.filter((r) => r.key !== key));
    focusSoon("a-add"); // the pressed button is gone: keep the focus in the panel
  }

  function endRow(row: AssignmentRow) {
    setEnding({
      title: row.officeId != null ? "Amt beenden" : "Zugehörigkeit beenden",
      description: (
        <>„{rowLabel(row)}“ wird beim Speichern beendet und steht dann unter „Frühere Ämter“.</>
      ),
      start: row.startDate || null,
      onConfirm: (end) => updateRow(row.key, { end }, ["endDate"]),
      focusAfter: rowId(row, "undo"),
    });
  }

  function endHolder(h: ActiveHolder) {
    setEnding({
      title: `Amtszeit von ${h.name} beenden`,
      description: "Die Amtszeit endet erst, wenn du speicherst – bis dahin lässt sich das rückgängig machen.",
      start: h.startDate,
      onConfirm: (end) =>
        set("endPrevious", [
          ...values.endPrevious.filter((o) => o.assignmentId !== h.assignmentId),
          { assignmentId: h.assignmentId, ...end },
        ]),
      focusAfter: `h-${h.assignmentId}-undo`,
    });
  }

  return (
    <Panel
      title="Ämter & Gliederungen"
      description={
        history
          ? "Gliederung ist Pflicht, Amt und „Seit“ sind optional. Beendete Ämter stehen nach dem Speichern unter „Frühere Ämter“."
          : "Gliederung ist Pflicht, Amt und „Seit“ sind optional."
      }
    >
      {rows.length === 0 ? (
        <p className="mb-3 text-ui text-ink-faint">Noch keiner Gliederung zugeordnet.</p>
      ) : (
        // Laid out by the panel's width, not the viewport's (the Verteiler column narrows it):
        // stacked when narrow, Gliederung | Amt over Seit | buttons in between, one line when
        // wide. One column template for all rows (subgrid), so the fields line up even when
        // only some rows offer "Beenden".
        <div className="mb-3 @container">
          <ul className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 divide-y divide-line @md:grid-cols-2 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9.5rem_auto]">
            {rows.map((row) => {
              const label = rowLabel(row);
              return (
                <li key={row.key} className="col-span-full grid grid-cols-subgrid py-3 first:pt-0 last:pb-0">
                  <div role="group" aria-label={label} className="col-span-full grid grid-cols-subgrid gap-y-2">
                    <ComboField
                      className="col-span-2 @md:col-span-1"
                      label="Gliederung"
                      id={rowId(row, "group")}
                      error={errors[`${row.key}.groupId`]}
                      options={groupOptions}
                      value={row.groupId != null ? String(row.groupId) : null}
                      onChange={(v) => updateRow(row.key, { groupId: Number(v) }, ["groupId"])}
                      {...GROUP_PICKER}
                    />
                    <ComboField
                      className="col-span-2 @md:col-span-1"
                      label="Amt"
                      id={rowId(row, "office")}
                      options={officeOptions}
                      value={row.officeId != null ? String(row.officeId) : null}
                      onChange={(v) => updateRow(row.key, { officeId: v === NONE ? null : Number(v) })}
                      {...OFFICE_PICKER}
                    />
                    {/* A buffered ending can only clash with a later Seit (the dialog checked
                        it against the Seit of then), so its error shows — and clears — here. */}
                    <TextField
                      className="max-w-38"
                      label="Seit"
                      id={rowId(row, "start")}
                      type="date"
                      error={errors[`${row.key}.startDate`] ?? errors[`${row.key}.endDate`]}
                      value={row.startDate}
                      onValueChange={(v) => updateRow(row.key, { startDate: v }, ["startDate", "endDate"])}
                    />
                    <div>
                      {/* Invisible caption: keeps the buttons level with the fields. */}
                      <span aria-hidden className="eyebrow invisible mb-1.5 block">
                        Aktion
                      </span>
                      <div className="flex items-center justify-end">
                        {row.id != null && !row.end ? (
                          <Button
                            id={rowId(row, "end")}
                            type="button"
                            variant="ghost"
                            className="text-ink-soft"
                            aria-label={`Beenden: ${label}`}
                            title="Beenden – beim Speichern wird daraus ein früheres Amt"
                            onClick={() => endRow(row)}
                          >
                            <CalendarOff aria-hidden className="@max-md:hidden" />
                            Beenden
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-ink-soft hover:text-crit"
                          aria-label={`Entfernen: ${label}`}
                          title="Entfernen – nur bei einer Fehleingabe"
                          onClick={() => removeRow(row.key)}
                        >
                          <X aria-hidden className="@max-md:hidden" />
                          Entfernen
                        </Button>
                      </div>
                    </div>
                  </div>
                  {/* Always rendered (a live region must exist before it changes): holder
                      warnings appear here after picking an Amt. */}
                  <div aria-live="polite" className="col-span-full mt-2 flex flex-col gap-1.5 empty:mt-0">
                    {row.end ? (
                      <EndingNote
                        undoId={rowId(row, "undo")}
                        onUndo={() => {
                          updateRow(row.key, { end: null }, ["endDate"]);
                          focusSoon(rowId(row, "end"));
                        }}
                      >
                        {capitalize(endingText(row.end))}
                      </EndingNote>
                    ) : null}
                    <HolderNotes
                      holders={otherHolders(row)}
                      orders={values.endPrevious}
                      onEnd={endHolder}
                      onUndo={(id) => {
                        set(
                          "endPrevious",
                          values.endPrevious.filter((o) => o.assignmentId !== id),
                        );
                        focusSoon(`h-${id}-end`);
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <AddRowButton id="a-add" onClick={addRow}>
        Gliederung/Amt hinzufügen
      </AddRowButton>

      {history ? (
        <HistorySection
          {...history}
          groupOptions={groupOptions}
          officeOptions={officeOptions}
        />
      ) : null}

      <EndDateDialog request={ending} onClose={() => setEnding(null)} />
    </Panel>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
