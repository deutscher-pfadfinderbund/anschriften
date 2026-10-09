"use client";

import { useMemo } from "react";
import Link from "next/link";

import { Panel } from "@/components/panel";
import { Checkbox } from "@/components/ui/checkbox";
import type { PersonEditData } from "@/db/queries";
import { todayIso } from "@/lib/format";
import type { FieldErrors } from "@/lib/person-schema";
import { RULE_KIND_LABELS } from "@/lib/rule-kinds";
import { TOUCH_HIT, cn } from "@/lib/utils";

import { TextField } from "./field";
import type { FormValues, SetValue } from "./form-values";

/** "Verteiler": manual memberships as checkboxes; rule-based ones locked and explained. */
export function ListsPanel({
  values,
  set,
  lists,
  ruleMemberships,
}: {
  values: FormValues;
  set: SetValue;
  lists: { id: number; name: string }[];
  ruleMemberships: PersonEditData["ruleMemberships"];
}) {
  // Lists that include the person automatically (via Amt, Stand or Gliederung). Their
  // checkbox is ticked and locked; `listIds` only ever holds the manual memberships.
  const reasons = useMemo(
    () =>
      new Map(
        ruleMemberships.map((r) => [
          r.listId,
          r.via.map((v) => `${RULE_KIND_LABELS[v.kind]}: ${v.name}`).join(", "),
        ]),
      ),
    [ruleMemberships],
  );

  function toggle(id: number, on: boolean) {
    const rest = values.listIds.filter((x) => x !== id);
    set("listIds", on ? [...rest, id].sort((a, b) => a - b) : rest);
  }

  return (
    <Panel title="Verteiler">
      {lists.length === 0 ? (
        <p className="text-ui text-ink-faint">
          Noch keine Verteiler angelegt. Das geht unter{" "}
          <Link href="/verteiler" className="text-fir underline-offset-2 hover:underline">
            Verteiler
          </Link>
          .
        </p>
      ) : (
        // Wider gap on touch so the labels' stretched tap bands abut instead of overlap.
        <ul className="flex flex-col gap-2.5 pointer-coarse:gap-4">
          {lists.map((l) => {
            const reason = reasons.get(l.id);
            return (
              <li key={l.id}>
                <label
                  className={cn(
                    TOUCH_HIT,
                    "flex items-start gap-2.5 text-ui",
                    reason ? "cursor-default" : "cursor-pointer",
                  )}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={reason != null || values.listIds.includes(l.id)}
                    disabled={reason != null}
                    onCheckedChange={(v) => toggle(l.id, v === true)}
                  />
                  <span className="min-w-0 text-ink">
                    {l.name}
                    {reason ? (
                      <span className="block text-caption text-ink-faint">automatisch über {reason}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** "Druck & Gedenken": leave out of the PDF, Sterbedatum. */
export function PrintPanel({ values, errors, set }: { values: FormValues; errors: FieldErrors; set: SetValue }) {
  return (
    <Panel title="Druck & Gedenken">
      <label className={cn(TOUCH_HIT, "flex cursor-pointer items-start gap-2.5 text-ui text-ink")}>
        <Checkbox
          className="mt-0.5"
          checked={values.doNotPrint}
          onCheckedChange={(v) => set("doNotPrint", v === true)}
        />
        <span>
          Nicht abdrucken
          <span className="block text-caption text-ink-faint">Erscheint in keinem PDF-Verzeichnis.</span>
        </span>
      </label>
      <hr className="my-4 border-line" />
      <TextField
        label="Sterbedatum"
        id="f-tod"
        type="date"
        max={todayIso()}
        hint="Im PDF steht die Person dann bei den Verstorbenen."
        error={errors.deathDate}
        value={values.deathDate}
        onValueChange={(v) => set("deathDate", v)}
      />
    </Panel>
  );
}
