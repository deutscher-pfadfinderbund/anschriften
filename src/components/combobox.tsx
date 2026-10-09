"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { spoken } from "@/lib/format";
import { FIELD, cn, matchesQuery } from "@/lib/utils";

export type ComboOption = { value: string; label: string; depth?: number };

/**
 * Searchable single-select (Popover + cmdk). Looks like a Select field;
 * filtering is umlaut-insensitive and every typed word must match.
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = "Auswählen …",
  searchPlaceholder = "Suchen …",
  emptyText = "Nichts gefunden.",
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  /** Forwarded to the trigger, so a <label htmlFor> can name it. */
  id?: string;
  options: ComboOption[];
  /** Selected option value, or null for none (shows the placeholder). */
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  "aria-label"?: string;
  /** Marks the trigger invalid (red ring, like the other fields). */
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  /** id of the error or hint line under the field. */
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          // PopoverTrigger adds aria-controls at runtime; the linter can't see it.
          // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={cn(
            FIELD,
            "flex items-center justify-between gap-1.5 pr-2 text-left",
            !selected && "text-ink-faint",
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-faint" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={ariaLabel ?? spoken(placeholder)}
        className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0"
        align="start"
      >
        <Command
          label={spoken(searchPlaceholder)}
          // The keyboard cursor starts on the chosen option.
          defaultValue={selected?.label}
          filter={(itemValue, search) => (matchesQuery(itemValue, search) ? 1 : 0)}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList label="Treffer">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {options.map((o) => (
              <CommandItem
                key={o.value}
                value={o.label}
                data-checked={o.value === value}
                onSelect={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span style={{ paddingLeft: `${(o.depth ?? 0) * 12}px` }}>{o.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
