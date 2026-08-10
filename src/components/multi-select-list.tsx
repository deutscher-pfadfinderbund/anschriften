"use client";

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { fold } from "@/lib/format";

export type MultiOption = {
  /** Stable numeric id. */
  value: number;
  /** Primary label shown in the row. */
  label: string;
  /** Optional secondary text (e.g. e-mail), also searchable. */
  hint?: string | null;
};

/**
 * Searchable, checkbox-style multi-select built on the cmdk Command primitives.
 * Stays open on select (unlike the single Combobox) and shows a checkmark for
 * chosen rows. Filtering is umlaut-insensitive and matches label + hint.
 */
export function MultiSelectList({
  options,
  selected,
  onToggle,
  searchPlaceholder = "Suchen …",
  emptyText = "Nichts gefunden.",
  className,
}: {
  options: MultiOption[];
  selected: Set<number>;
  onToggle: (value: number) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
}) {
  return (
    <Command
      className={className}
      filter={(itemValue, search) => (fold(itemValue).includes(fold(search)) ? 1 : 0)}
    >
      <CommandInput placeholder={searchPlaceholder} />
      <CommandList className="max-h-[320px]">
        <CommandEmpty>{emptyText}</CommandEmpty>
        {options.map((o) => (
          <CommandItem
            // Unique, searchable value: label + hint + id (id keeps duplicates distinct).
            key={o.value}
            value={`${o.label} ${o.hint ?? ""} #${o.value}`}
            data-checked={selected.has(o.value)}
            onSelect={() => onToggle(o.value)}
          >
            {/* Name and hint share one shrinkable box. Without it the row's
                min-content is "name + e-mail on one line" (~373px), which no
                amount of dialog sizing can compress — the panel then overflowed
                its own 358px box on a 390px phone. `min-w-0 flex-1` drops the
                row's min-content to the checkmark, and below `sm` the hint moves
                under the name instead of competing with it for the same line. */}
            <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-2">
              <span className="truncate text-ink">{o.label}</span>
              {o.hint ? <span className="truncate text-ink-faint">{o.hint}</span> : null}
            </span>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}
