"use client";

import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fold } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string; depth?: number };

/**
 * Searchable single-select (Popover + cmdk Command). Values are unique labels;
 * filtering is umlaut-insensitive. `disabledValues` greys out options (e.g. to
 * prevent duplicate assignments or parent cycles).
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Auswählen …",
  searchPlaceholder = "Suchen …",
  emptyText = "Nichts gefunden.",
  disabledValues,
  className,
  "aria-label": ariaLabel,
}: {
  options: ComboOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabledValues?: Set<string>;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            // h-8 matches Input and SelectTrigger so mixed rows share a baseline.
            "h-8 w-full justify-between font-normal",
            !selected && "text-ink-faint",
            className,
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0"
        align="start"
      >
        <Command
          filter={(itemValue, search) =>
            fold(itemValue).includes(fold(search)) ? 1 : 0
          }
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {options.map((o) => {
              const isDisabled = disabledValues?.has(o.value) ?? false;
              return (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  disabled={isDisabled}
                  data-checked={o.value === value}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span style={{ paddingLeft: `${(o.depth ?? 0) * 12}px` }}>{o.label}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
