"use client";

import { SearchField } from "@/components/search-field";
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

import type { DirectoryFilters, FilterName } from "./directory-filter";

/** id of the search field, where keyboard focus returns after a reset. */
export const SEARCH_ID = "personen-suche";

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
        <SelectItem key={group.id} value={String(group.id)} style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}>
          {group.name}
        </SelectItem>
      ))}
    </SelectGroup>
  ));
}

export function DirectoryToolbar({
  query,
  onQueryChange,
  onQueryCommit,
  filters,
  onFilterChange,
  groups,
  offices,
  distributionLists,
  status,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  /** The field lost focus: write a pending search to the URL now. */
  onQueryCommit: () => void;
  filters: Omit<DirectoryFilters, "q">;
  onFilterChange: (name: FilterName, id: number | null) => void;
  groups: GroupRow[];
  offices: Option[];
  distributionLists: Option[];
  /** Result summary and reset action, right-aligned after the filters. */
  status: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {/* Below xl the search takes its own row and the three filters share the next one. */}
      <SearchField
        id={SEARCH_ID}
        label="Personen durchsuchen"
        placeholder="Name, Amt, Ort, E-Mail, Telefon …"
        value={query}
        onChange={onQueryChange}
        onBlur={onQueryCommit}
        className="xl:w-72"
      />
      <FilterSelect
        label="Nach Gliederung filtern"
        allLabel="Alle Gliederungen"
        value={filters.groupId}
        onChange={(id) => onFilterChange("groupId", id)}
        className="sm:w-52"
      >
        <GroupItems groups={groups} />
      </FilterSelect>
      {/* Phones: Amt and Verteiler share a row; from sm up `contents` flattens the grid. */}
      <div className={cn("grid gap-2 sm:contents", distributionLists.length > 0 && "grid-cols-2")}>
        <FilterSelect
          label="Nach Amt filtern"
          allLabel="Alle Ämter"
          value={filters.officeId}
          onChange={(id) => onFilterChange("officeId", id)}
          className="sm:w-44"
        >
          <OptionItems options={offices} />
        </FilterSelect>
        {distributionLists.length > 0 ? (
          <FilterSelect
            label="Nach Verteiler filtern"
            allLabel="Alle Verteiler"
            value={filters.listId}
            onChange={(id) => onFilterChange("listId", id)}
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
