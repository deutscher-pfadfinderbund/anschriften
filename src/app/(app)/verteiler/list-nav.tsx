"use client";

import { Field } from "@/components/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DistributionListWithMembers } from "@/db/queries";
import { plural } from "@/lib/format";
import { NAV_ROW, cn } from "@/lib/utils";

/**
 * The list of Verteiler. From `lg` up a quiet rail with the sidebar's NAV_ROW; below
 * that a single select field, so
 * on a phone the chosen list's members start right under it instead of a screen lower.
 */
export function ListNav({
  lists,
  activeId,
  onSelect,
}: {
  lists: DistributionListWithMembers[];
  activeId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <>
      <Field label="Verteiler" id="verteiler-wahl" className="lg:hidden">
        <Select
          value={activeId != null ? String(activeId) : undefined}
          onValueChange={(v) => onSelect(Number(v))}
        >
          <SelectTrigger id="verteiler-wahl" className="w-full">
            <SelectValue placeholder="Verteiler wählen" />
          </SelectTrigger>
          <SelectContent position="popper">
            {lists.map((l) => (
              <SelectItem key={l.id} value={String(l.id)}>
                {l.name}
                <span className="text-ink-faint tabular-nums">{l.members.length}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <nav aria-label="Verteiler" className="hidden lg:sticky lg:top-gutter lg:block">
        <ul className="flex flex-col gap-0.5">
          {lists.map((l) => {
            const active = l.id === activeId;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => onSelect(l.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(NAV_ROW.base, "gap-2 text-left", active ? NAV_ROW.active : NAV_ROW.idle)}
                >
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                  {/* ink-faint is too faint on the --active fill in dark mode (< 4.5:1). */}
                  <span
                    className={cn(
                      "text-caption font-normal tabular-nums",
                      active ? "text-ink-soft" : "text-ink-faint",
                    )}
                  >
                    <span className="sr-only">, </span>
                    {l.members.length}
                    <span className="sr-only"> {plural(l.members.length, "Mitglied", "Mitglieder")}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
