"use client";

import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  type ColumnDef,
  type RowSelectionState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, SearchX, Users, X } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableHead } from "@/components/ui/table";
import type { GroupRow, OfficeRow, PersonListRow } from "@/db/queries";
import { cn } from "@/lib/utils";

import { type SearchIndex, filterPersons, hasActiveFilters, searchIndex } from "./directory-filter";
import { PersonCard, PersonTableRow } from "./directory-rows";
import { SelectionBar } from "./directory-selection";
import { DirectoryToolbar } from "./directory-toolbar";
import { useDirectoryParams } from "./use-directory-params";

type Indexed = PersonListRow & SearchIndex;

// TanStack only sorts and tracks the selection; the rows render themselves.
const COLUMNS: ColumnDef<Indexed>[] = [{ id: "name", accessorFn: (p) => p.sortKey, sortingFn: "basic" }];

// Tailwind's `md`: the table from here up, the card list below.
const DESKTOP = "(min-width: 48rem)";
function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Header cells stick below the mobile top bar (h-14, below lg) or the viewport top.
 * The bottom line is an inset shadow: a collapsed border would stay behind when stuck.
 */
const STICKY_HEAD = "sticky top-14 z-10 bg-surface-2 shadow-[inset_0_-1px_0_var(--line-strong)] lg:top-0";

/**
 * The focused control is about to unmount (a reset or clear button): move keyboard focus
 * to `target`, so keyboard users keep their place instead of starting over at the page
 * top. Pointer focus is left alone: a tap must not open the phone keyboard.
 */
function keepKeyboardFocus(target: HTMLElement | null) {
  if (document.activeElement?.matches(":focus-visible")) target?.focus();
}

/**
 * Tri-state "select all" over the persons currently shown: selected persons the
 * filters hide neither count nor change (the selection bar reports them). The shared
 * Checkbox draws its check mark for "indeterminate" too; here the mixed state gets a dash.
 */
function SelectAllCheckbox({
  ref,
  checked,
  onCheckedChange,
  filtered,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  checked: boolean | "indeterminate";
  onCheckedChange: (checked: boolean) => void;
  filtered: boolean;
}) {
  return (
    <Checkbox
      ref={ref}
      aria-label={filtered ? "Alle angezeigten auswählen" : "Alle auswählen"}
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      className="data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:before:h-0.5 data-[state=indeterminate]:before:w-2 data-[state=indeterminate]:before:rounded-full data-[state=indeterminate]:before:bg-primary-foreground data-[state=indeterminate]:[&_svg]:hidden"
    />
  );
}

export function Directory({
  persons,
  groups,
  offices,
  distributionLists,
  mailEnabled,
}: {
  persons: PersonListRow[];
  groups: GroupRow[];
  offices: OfficeRow[];
  distributionLists: { id: number; name: string }[];
  /** True when the optional mail module is configured (see isMailEnabled). */
  mailEnabled: boolean;
}) {
  const router = useRouter();
  const params = useDirectoryParams();
  // An id in the URL that no longer exists (deleted Gliederung, old link) counts as unset.
  const groupId = groups.some((g) => g.id === params.groupId) ? params.groupId : null;
  const officeId = offices.some((o) => o.id === params.officeId) ? params.officeId : null;
  const listId = distributionLists.some((l) => l.id === params.listId) ? params.listId : null;

  const indexed = useMemo(() => persons.map((p) => ({ ...p, ...searchIndex(p) })), [persons]);
  // The field updates on every keystroke; the list follows in a deferred render.
  const q = useDeferredValue(params.query);
  const filtered = useMemo(
    () => filterPersons(indexed, { q, groupId, officeId, listId }, groups),
    [indexed, q, groupId, officeId, listId, groups],
  );
  const filtering = hasActiveFilters({ q, groupId, officeId, listId });
  const selectFilters = groupId != null || officeId != null || listId != null;

  // Keyed by person id; survives filter changes (the bar reports hidden ones).
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const sorting = useMemo(() => [{ id: "name", desc: params.sortDesc }], [params.sortDesc]);
  const table = useReactTable({
    data: filtered,
    columns: COLUMNS,
    state: { sorting, rowSelection },
    getRowId: (p) => String(p.id),
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const rows = table.getRowModel().rows;
  const shownSelected = rows.filter((row) => row.getIsSelected()).length;
  const allShownChecked = shownSelected === 0 ? false : shownSelected === rows.length ? true : "indeterminate";

  // Stable callbacks keep the memoized rows from re-rendering.
  const setSelected = useCallback((id: number, selected: boolean) => {
    setRowSelection((prev) => {
      const next = { ...prev };
      if (selected) next[id] = true;
      else delete next[id];
      return next;
    });
  }, []);
  const openPerson = useCallback((id: number) => router.push(`/personen/${id}`), [router]);

  const selected = useMemo(() => persons.filter((p) => rowSelection[p.id]), [persons, rowSelection]);
  const shownIds = useMemo(() => new Set(filtered.map((p) => p.id)), [filtered]);
  const hiddenCount = selected.filter((p) => !shownIds.has(p.id)).length;

  const searchRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLButtonElement>(null);
  const resetFilters = () => {
    keepKeyboardFocus(searchRef.current);
    params.resetFilters();
  };
  const clearSelection = () => {
    // With every selected person hidden there is no list (and no select-all) to return to.
    keepKeyboardFocus(selectAllRef.current ?? searchRef.current);
    setRowSelection({});
  };

  // Render only the layout that is on screen; null (server, hydration) renders both
  // and lets CSS decide, so the first paint is right on every device.
  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP).matches,
    () => null,
  );

  return (
    // The selection bar comes right after the toolbar in the DOM (keyboard users reach
    // it without tabbing through every row) and is shown last, sticking to the bottom.
    <div className="flex flex-col">
      <DirectoryToolbar
        searchRef={searchRef}
        query={params.query}
        onQueryChange={params.setQuery}
        groupId={groupId}
        onGroupChange={params.setGroupId}
        officeId={officeId}
        onOfficeChange={params.setOfficeId}
        listId={listId}
        onListChange={params.setListId}
        groups={groups}
        offices={offices}
        distributionLists={distributionLists}
        status={
          // Phones stack the toolbar; an empty status must not leave a gap there.
          <div className={cn("flex items-center gap-3 sm:ml-auto", !filtering && "max-sm:-mt-2")}>
            {/* Always mounted, so screen readers announce the count as it changes. */}
            <p role="status" className="text-caption tabular-nums text-ink-soft">
              {filtering ? `${filtered.length} von ${persons.length} angezeigt` : ""}
            </p>
            {/* With no results the empty state offers the same button, larger. */}
            {filtering && rows.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="text-ink-soft">
                <X />
                Filter zurücksetzen
              </Button>
            ) : null}
          </div>
        }
      />

      {selected.length > 0 ? (
        <SelectionBar
          className="order-last"
          selected={selected}
          hiddenCount={hiddenCount}
          onKeepVisible={() =>
            setRowSelection(Object.fromEntries(selected.filter((p) => shownIds.has(p.id)).map((p) => [p.id, true])))
          }
          onClear={clearSelection}
          distributionLists={distributionLists}
          mailEnabled={mailEnabled}
        />
      ) : null}

      <div className="mt-3 overflow-clip rounded-lg border border-line bg-surface">
        {persons.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Noch keine Personen erfasst."
            description="Lege die erste Person über „Neue Person“ oben rechts an."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Keine Person gefunden."
            description={
              selectFilters
                ? `Niemand passt zu ${q.trim() ? `„${q.trim()}“ und ` : ""}den gewählten Filtern.`
                : `Niemand passt zu „${q.trim()}“.`
            }
            action={
              <Button variant="outline" onClick={resetFilters}>
                <X />
                {selectFilters ? "Filter zurücksetzen" : "Suche leeren"}
              </Button>
            }
          />
        ) : (
          <>
            {isDesktop !== false ? (
              <table className={cn("w-full table-fixed text-ui", isDesktop == null && "hidden md:table")}>
                {/* Fixed widths: columns do not jump while the search narrows the list. */}
                <colgroup>
                  <col className="w-11" />
                  <col className="w-[29%]" />
                  <col className="w-[18%]" />
                  <col className="w-[19%]" />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <TableHead className={cn(STICKY_HEAD, "p-0")}>
                      <label className="flex cursor-pointer py-3 pr-1 pl-3">
                        <SelectAllCheckbox
                          ref={selectAllRef}
                          checked={allShownChecked}
                          onCheckedChange={table.toggleAllRowsSelected}
                          filtered={filtering}
                        />
                      </label>
                    </TableHead>
                    <TableHead
                      aria-sort={params.sortDesc ? "descending" : "ascending"}
                      className={cn(STICKY_HEAD, "px-3")}
                    >
                      <button
                        type="button"
                        onClick={() => params.setSortDesc(!params.sortDesc)}
                        title={params.sortDesc ? "Aufsteigend sortieren" : "Absteigend sortieren"}
                        className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 uppercase transition-colors hover:text-ink"
                      >
                        Name
                        {params.sortDesc ? (
                          <ArrowDown aria-hidden className="size-3" />
                        ) : (
                          <ArrowUp aria-hidden className="size-3" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead className={cn(STICKY_HEAD, "px-3")}>Ämter</TableHead>
                    <TableHead className={cn(STICKY_HEAD, "px-3")}>Gliederung</TableHead>
                    <TableHead className={cn(STICKY_HEAD, "px-3")}>Kontakt</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <PersonTableRow
                      key={row.id}
                      person={row.original}
                      selected={row.getIsSelected()}
                      onSelectedChange={setSelected}
                      onOpen={openPerson}
                    />
                  ))}
                </tbody>
              </table>
            ) : null}
            {isDesktop !== true ? (
              <div className={cn(isDesktop == null && "md:hidden")}>
                <label className="flex cursor-pointer items-center gap-3 border-b border-line-strong bg-surface-2 px-3 py-2.5">
                  <SelectAllCheckbox
                    // One ref for both layouts: the table's unmounting after hydration
                    // would otherwise null it while this one stays.
                    ref={isDesktop === false ? selectAllRef : undefined}
                    checked={allShownChecked}
                    onCheckedChange={table.toggleAllRowsSelected}
                    filtered={filtering}
                  />
                  <span className="eyebrow">{filtering ? "Alle angezeigten auswählen" : "Alle auswählen"}</span>
                </label>
                <ul>
                  {rows.map((row) => (
                    <PersonCard
                      key={row.id}
                      person={row.original}
                      selected={row.getIsSelected()}
                      onSelectedChange={setSelected}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>

    </div>
  );
}
