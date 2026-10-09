"use client";

import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GroupRow } from "@/db/queries";
import { orderGroups } from "@/lib/groups";
import { SECTION_LABELS, type Section } from "@/lib/sections";
import { cn } from "@/lib/utils";

/** Radix Select needs a non-empty value for the "no filter" option. */
const ALL = "alle";

type Option = { id: number; name: string };

/** A filter Select over ids; "Alle …" clears it. */
function FilterSelect({
  label,
  allLabel,
  value,
  onChange,
  className,
  children,
}: {
  label: string;
  allLabel: string;
  value: number | null;
  onChange: (id: number | null) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Select
      value={value == null ? ALL : String(value)}
      onValueChange={(v) => onChange(v === ALL ? null : Number(v))}
    >
      {/* An unset filter ("Alle …") reads quieter than an active one. */}
      <SelectTrigger aria-label={label} className={cn("w-full", value == null && "text-ink-soft", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[360px]">
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {children}
      </SelectContent>
    </Select>
  );
}

function OptionItems({ options }: { options: Option[] }) {
  return options.map((o) => (
    <SelectItem key={o.id} value={String(o.id)}>
      {o.name}
    </SelectItem>
  ));
}

/** Gliederungen grouped by Bereich and indented by depth (a pick includes the subtree). */
function GroupItems({ groups }: { groups: GroupRow[] }) {
  const bySection = new Map<Section, { group: GroupRow; depth: number }[]>();
  for (const item of orderGroups(groups)) {
    const list = bySection.get(item.group.section);
    if (list) list.push(item);
    else bySection.set(item.group.section, [item]);
  }
  return [...bySection].map(([section, items]) => (
    <SelectGroup key={section}>
      <SelectLabel>{SECTION_LABELS[section]}</SelectLabel>
      {items.map(({ group, depth }) => (
        <SelectItem key={group.id} value={String(group.id)} style={{ paddingLeft: `${0.375 + depth * 0.75}rem` }}>
          {group.name}
        </SelectItem>
      ))}
    </SelectGroup>
  ));
}

/** Search field with a quiet clear button (Escape clears too). */
function SearchField({
  inputRef,
  value,
  onChange,
  onBlur,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="relative w-full sm:w-72">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-faint" />
      <Input
        ref={inputRef}
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
        placeholder="Name, Amt, Ort, E-Mail, Telefon …"
        aria-label="Personen durchsuchen"
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

export function DirectoryToolbar({
  searchRef,
  query,
  onQueryChange,
  onQueryCommit,
  groupId,
  onGroupChange,
  officeId,
  onOfficeChange,
  listId,
  onListChange,
  groups,
  offices,
  distributionLists,
  status,
}: {
  /** The search field, for returning focus to it. */
  searchRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (q: string) => void;
  /** The field lost focus: write a pending search to the URL now. */
  onQueryCommit: () => void;
  groupId: number | null;
  onGroupChange: (id: number | null) => void;
  officeId: number | null;
  onOfficeChange: (id: number | null) => void;
  listId: number | null;
  onListChange: (id: number | null) => void;
  groups: GroupRow[];
  offices: Option[];
  distributionLists: Option[];
  /** Result summary and reset action, right-aligned after the filters. */
  status: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <SearchField inputRef={searchRef} value={query} onChange={onQueryChange} onBlur={onQueryCommit} />
      <FilterSelect
        label="Nach Gliederung filtern"
        allLabel="Alle Gliederungen"
        value={groupId}
        onChange={onGroupChange}
        className="sm:w-52"
      >
        <GroupItems groups={groups} />
      </FilterSelect>
      {/* Phones: Amt and Verteiler share a row; from sm up `contents` flattens the grid. */}
      <div className={cn("grid gap-2 sm:contents", distributionLists.length > 0 && "grid-cols-2")}>
        <FilterSelect
          label="Nach Amt filtern"
          allLabel="Alle Ämter"
          value={officeId}
          onChange={onOfficeChange}
          className="sm:w-44"
        >
          <OptionItems options={offices} />
        </FilterSelect>
        {distributionLists.length > 0 ? (
          <FilterSelect
            label="Nach Verteiler filtern"
            allLabel="Alle Verteiler"
            value={listId}
            onChange={onListChange}
            className="sm:w-44"
          >
            <OptionItems options={distributionLists} />
          </FilterSelect>
        ) : null}
      </div>
      {status}
    </div>
  );
}
