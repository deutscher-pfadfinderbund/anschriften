"use client";

import { FormLabel } from "@/components/form-label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DistributionListWithMembers } from "@/db/queries";
import { cn } from "@/lib/utils";

/**
 * The list of Verteiler. From `lg` up a quiet rail with the sidebar's active language
 * (--active fill, fir text, straight fir marker); below that a single select field, so
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
      <div className="lg:hidden">
        <FormLabel htmlFor="verteiler-wahl">Verteiler</FormLabel>
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
      </div>

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
                  className={cn(
                    "relative flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-ui transition-colors",
                    active
                      ? "bg-active font-medium text-fir before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-fir"
                      : "text-ink-soft hover:bg-hover hover:text-ink",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                  <span className="text-caption font-normal text-ink-faint tabular-nums">
                    <span className="sr-only">, </span>
                    {l.members.length}
                    <span className="sr-only"> {l.members.length === 1 ? "Mitglied" : "Mitglieder"}</span>
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
