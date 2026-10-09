"use client";

import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, SearchX, Users, X } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableHead } from "@/components/ui/table";
import type { GroupRow, OfficeRow, PersonListRow } from "@/db/queries";
import { cn } from "@/lib/utils";

import { filterPersons, hasActiveFilters, searchIndex } from "./directory-filter";
import { PersonCard, PersonTableRow } from "./directory-rows";
import { SelectionBar } from "./directory-selection";
import { DirectoryToolbar, SEARCH_ID } from "./directory-toolbar";
import { useDirectoryParams } from "./use-directory-params";

/**
 * Header cells stick below the mobile top bar (--top-bar, 0 from lg up).
 * The bottom line is an inset shadow: a collapsed border would stay behind when stuck.
 */
const STICKY_HEAD = "sticky top-(--top-bar) z-10 bg-surface-2 shadow-[inset_0_-1px_0_var(--line-strong)]";

/**
 * The focused control is about to unmount (a reset or clear button): move keyboard focus
 * to the search field, so keyboard users keep their place instead of starting over at the
 * page top. Pointer focus is left alone: a tap must not open the phone keyboard.
 */
function keepKeyboardFocus() {
  if (document.activeElement?.matches(":focus-visible")) document.getElementById(SEARCH_ID)?.focus();
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

  // `persons` arrive in directory order (listPersons sorts them with byDirectoryName);
  // descending is the same list reversed. Filtering keeps the order.
  const indexed = useMemo(() => persons.map((p) => ({ ...p, ...searchIndex(p) })), [persons]);
  const ordered = useMemo(() => (params.sortDesc ? [...indexed].reverse() : indexed), [indexed, params.sortDesc]);
  // The field updates on every keystroke; the list follows in a deferred render.
  const q = useDeferredValue(params.query);
  const rows = useMemo(
    () => filterPersons(ordered, { q, groupId, officeId, listId }, groups),
    [ordered, q, groupId, officeId, listId, groups],
  );
  const filtering = hasActiveFilters({ q, groupId, officeId, listId });
  const selectFilters = groupId != null || officeId != null || listId != null;

  // Selected person ids; survives filter changes (the bar reports hidden ones).
  const [selection, setSelection] = useState<ReadonlySet<number>>(() => new Set());
  const shownSelected = rows.filter((p) => selection.has(p.id));
  const allShownChecked =
    shownSelected.length === 0 ? false : shownSelected.length === rows.length ? true : "indeterminate";

  // Stable callbacks keep the memoized rows from re-rendering.
  const setSelected = useCallback((id: number, selected: boolean) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  /** Select or clear every shown person; selected persons the filters hide stay as they are. */
  const setAllShown = (selected: boolean) =>
    setSelection((prev) => {
      const next = new Set(prev);
      for (const p of rows) {
        if (selected) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  const openPerson = useCallback((id: number) => router.push(`/personen/${id}`), [router]);

  const selected = useMemo(() => persons.filter((p) => selection.has(p.id)), [persons, selection]);
  const hiddenCount = selected.length - shownSelected.length;

  const resetFilters = () => {
    keepKeyboardFocus();
    params.resetFilters();
  };
  const clearSelection = () => {
    keepKeyboardFocus();
    setSelection(new Set());
  };

  // Tri-state over the persons shown: selected persons the filters hide neither count
  // nor change (the selection bar reports them).
  const selectAll = (
    <Checkbox
      aria-label={filtering ? "Alle angezeigten auswählen" : "Alle auswählen"}
      checked={allShownChecked}
      onCheckedChange={(v) => setAllShown(v === true)}
    />
  );

  return (
    // The selection bar comes right after the toolbar in the DOM (keyboard users reach
    // it without tabbing through every row) and is shown last, sticking to the bottom.
    <div className="flex flex-col">
      <DirectoryToolbar
        query={params.query}
        onQueryChange={params.setQuery}
        onQueryCommit={params.flushQuery}
        filters={{ groupId, officeId, listId }}
        onFilterChange={params.setFilter}
        groups={groups}
        offices={offices}
        distributionLists={distributionLists}
        status={
          // Phones stack the toolbar; an empty status must not leave a gap there.
          <div className={cn("flex items-center gap-3 sm:ml-auto", !filtering && "max-sm:-mt-2")}>
            {/* Always mounted, so screen readers announce the count as it changes. */}
            <p role="status" className="text-caption tabular-nums text-ink-soft">
              {filtering ? `${rows.length} von ${persons.length} angezeigt` : ""}
              {/* The Gliederung filter takes in the whole subtree (Verteiler rules do not). */}
              {groupId != null && groups.some((g) => g.parentId === groupId) ? " · mit Untergliederungen" : ""}
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

      {/* Always mounted (unlike the bar), so ticking a row announces the new count. */}
      <p role="status" className="sr-only">
        {selected.length > 0 ? `${selected.length} ausgewählt` : ""}
      </p>
      {selected.length > 0 ? (
        <SelectionBar
          className="order-last"
          selected={selected}
          hiddenCount={hiddenCount}
          onKeepVisible={() => setSelection(new Set(shownSelected.map((p) => p.id)))}
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
          // Both layouts, CSS picks one: the table from `md` up, the cards below.
          <>
            <table
              className={cn(
                "hidden w-full table-fixed text-ui md:table",
                // The page's scroll padding keeps a row that gets keyboard focus clear
                // of the sticky head (and the top bar above it, below lg).
                "md:[html:has(&)]:scroll-pt-[calc(var(--top-bar)+3rem)]",
              )}
            >
              {/* Fixed widths: columns do not jump while the search narrows the list. */}
              <colgroup>
                <col className="w-11" />
                <col className="w-[28%]" />
                <col className="w-[17%]" />
                <col className="w-[18%]" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <TableHead className={cn(STICKY_HEAD, "p-0")}>
                    <label className="flex cursor-pointer py-3 pr-1 pl-3">{selectAll}</label>
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
                {rows.map((p) => (
                  <PersonTableRow
                    key={p.id}
                    person={p}
                    selected={selection.has(p.id)}
                    onSelectedChange={setSelected}
                    onOpen={openPerson}
                  />
                ))}
              </tbody>
            </table>
            <div className="md:hidden">
              <label className="flex cursor-pointer items-center gap-3 border-b border-line-strong bg-surface-2 px-3 py-2.5">
                {selectAll}
                <span className="eyebrow">{filtering ? "Alle angezeigten auswählen" : "Alle auswählen"}</span>
              </label>
              <ul>
                {rows.map((p) => (
                  <PersonCard key={p.id} person={p} selected={selection.has(p.id)} onSelectedChange={setSelected} />
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
