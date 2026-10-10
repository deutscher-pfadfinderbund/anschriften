"use client";

import { useRef } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A search input with a quiet clear button (Escape clears too). */
export function SearchField({
  id,
  label,
  placeholder,
  value,
  onChange,
  onBlur,
  className,
}: {
  id: string;
  /** Accessible name (the field has no visible label). */
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Width classes on the wrapper (full width by default). */
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={cn("relative w-full", className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-faint" />
      <Input
        ref={inputRef}
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        // The native cancel glyph is replaced by the button below (Firefox has none).
        className="pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            // The button unmounts; clearing is usually followed by a new search.
            inputRef.current?.focus();
          }}
          aria-label="Suche leeren"
          title="Suche leeren"
          // Already positioned, so the ::after tap band needs no TOUCH_HIT (whose
          // `relative` would pull the button out of the field).
          className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded-sm text-ink-faint transition-colors after:absolute after:-inset-2 hover:text-ink"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
