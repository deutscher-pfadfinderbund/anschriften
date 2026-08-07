"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  type ColumnDef,
  type Row,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Copy, Download, Plus, Search, Send, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { addMembers } from "@/actions/lists";
import { Combobox } from "@/components/combobox";
import { ComposeMailDialog } from "@/components/compose-mail-dialog";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DistributionListSummary, GroupRow, OfficeRow, PersonListRow } from "@/db/queries";
import { buildBcc } from "@/lib/export";
import { SECTION_LABELS, birthYear, fold, formatName } from "@/lib/format";
import { orderGroups } from "@/lib/groups";

const ALL = "__all__";

function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

/** Parse a download filename out of a Content-Disposition header, if present. */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(header);
  return match ? decodeURIComponent(match[1].replace(/"$/, "")) : null;
}

/** Trigger a browser download for an in-memory blob (keeps the user on the page). */
function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type Indexed = PersonListRow & { _search: string };

export function PersonsTable({
  persons,
  groups,
  offices,
  distributionLists,
  mailEnabled = false,
}: {
  persons: PersonListRow[];
  groups: GroupRow[];
  offices: OfficeRow[];
  distributionLists: DistributionListSummary[];
  /** True when the optional mail module is configured (see isMailEnabled). */
  mailEnabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>(ALL);
  const [officeFilter, setOfficeFilter] = useState<string>(ALL);
  const [listFilter, setListFilter] = useState<string>(ALL);
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [targetListId, setTargetListId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [csvPending, setCsvPending] = useState(false);

  const orderedGroups = useMemo(() => orderGroups(groups), [groups]);

  const indexed: Indexed[] = useMemo(
    () =>
      persons.map((p) => ({
        ...p,
        _search: fold(
          [p.lastName, p.firstName, p.scoutName, p.city, p.email].filter(Boolean).join(" "),
        ),
      })),
    [persons],
  );

  const filtered = useMemo(() => {
    const q = fold(search);
    const groupId = groupFilter === ALL ? null : Number(groupFilter);
    const officeId = officeFilter === ALL ? null : Number(officeFilter);
    const listId = listFilter === ALL ? null : Number(listFilter);
    return indexed.filter((p) => {
      if (q && !p._search.includes(q)) return false;
      if (groupId != null && !p.assignments.some((a) => a.groupId === groupId)) return false;
      if (officeId != null && !p.assignments.some((a) => a.officeId === officeId)) return false;
      // Effective membership (manual ∪ office rule), matching the Verteiler detail.
      if (listId != null && !p.effectiveListIds.includes(listId)) return false;
      return true;
    });
  }, [indexed, search, groupFilter, officeFilter, listFilter]);

  const filtersActive =
    search.trim() !== "" ||
    groupFilter !== ALL ||
    officeFilter !== ALL ||
    listFilter !== ALL;
  function resetFilters() {
    setSearch("");
    setGroupFilter(ALL);
    setOfficeFilter(ALL);
    setListFilter(ALL);
  }

  const columns = useMemo<ColumnDef<Indexed>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        header: ({ table }) => (
          <div onClick={(e) => e.stopPropagation()} className="flex items-center">
            <Checkbox
              aria-label="Alle auswählen"
              checked={
                table.getIsAllRowsSelected()
                  ? true
                  : table.getIsSomeRowsSelected()
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(v) => table.toggleAllRowsSelected(v === true)}
            />
          </div>
        ),
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()} className="flex items-center">
            <Checkbox
              aria-label="Zeile auswählen"
              checked={row.getIsSelected()}
              onCheckedChange={(v) => row.toggleSelected(v === true)}
            />
          </div>
        ),
      },
      {
        id: "name",
        accessorFn: (p) => fold(p.lastName || p.scoutName || ""),
        header: "Name",
        cell: ({ row }) => {
          const p = row.original;
          const showScout = !!p.scoutName && !!(p.lastName || p.firstName);
          const sub = [p.rankName, birthYear(p.birthDate) ? `*${birthYear(p.birthDate)}` : null]
            .filter(Boolean)
            .join(" · ");
          return (
            <div>
              <Link
                href={`/personen/${p.id}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded-sm font-medium whitespace-nowrap text-ink outline-none transition-colors hover:text-fir focus-visible:ring-2 focus-visible:ring-ring"
              >
                {formatName(p)}
                {showScout ? (
                  <span className="ml-1.5 font-normal text-ink-soft">„{p.scoutName}“</span>
                ) : null}
              </Link>
              {sub ? <div className="text-xs tabular-nums text-ink-faint">{sub}</div> : null}
            </div>
          );
        },
      },
      {
        id: "offices",
        header: "Ämter",
        enableSorting: false,
        cell: ({ row }) => {
          const offs = row.original.assignments.filter((a) => a.officeName);
          if (offs.length === 0) return <span className="text-ink-faint">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {offs.map((a) => (
                <Badge
                  key={a.id}
                  variant="secondary"
                  title={`${a.officeName} · ${a.groupName}`}
                  className="rounded-[4px] border border-line font-normal text-ink-soft"
                >
                  {a.officeName}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        id: "group",
        header: "Gliederung",
        enableSorting: false,
        cell: ({ row }) => {
          const names = distinct(row.original.assignments.map((a) => a.groupName));
          if (names.length === 0) return <span className="text-ink-faint">—</span>;
          return (
            <div>
              <div className="text-ink">{names[0]}</div>
              {names.slice(1).map((n) => (
                <div key={n} className="text-xs text-ink-faint">
                  {n}
                </div>
              ))}
            </div>
          );
        },
      },
      {
        id: "contact",
        header: "Kontakt",
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original;
          const phone = p.phones[0];
          return (
            <div>
              {p.email ? (
                <a
                  href={`mailto:${p.email}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-fir hover:underline"
                >
                  {p.email}
                </a>
              ) : (
                <span className="text-ink-faint">—</span>
              )}
              {phone ? (
                <div className="text-[12.5px] tabular-nums text-ink-soft">
                  {phone.number}
                  {phone.label ? ` · ${phone.label}` : ""}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "flags",
        header: "Kennzeichen",
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original;
          if (!p.doNotPrint && !p.deathDate) return null;
          return (
            <div className="flex flex-col items-start gap-1">
              {p.doNotPrint ? (
                <span className="inline-block rounded-[4px] bg-crit-tint px-1.5 py-px text-[10.5px] font-semibold text-crit">
                  nicht abdrucken
                </span>
              ) : null}
              {p.deathDate ? (
                <span className="text-[11px] text-ink-faint">verstorben</span>
              ) : null}
            </div>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, rowSelection },
    getRowId: (row) => String(row.id),
    enableRowSelection: true,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;

  // Selected persons, resolved by id (selection persists across filter changes).
  const selectedPersons = useMemo(
    () => persons.filter((p) => rowSelection[String(p.id)]),
    [persons, rowSelection],
  );
  const selectedCount = selectedPersons.length;

  // Recipient preview for the compose dialog (server recomputes on send).
  const selectedBcc = useMemo(
    () => buildBcc(selectedPersons.map((p) => p.email), "; "),
    [selectedPersons],
  );

  function copySelectedEmails() {
    const { text, count, skipped } = buildBcc(
      selectedPersons.map((p) => p.email),
      "; ",
    );
    if (text.length === 0) {
      toast.error("Keine E-Mail-Adressen in der Auswahl.");
      return;
    }
    navigator.clipboard.writeText(text).then(
      () =>
        toast.success(
          `${count} Adressen kopiert${skipped > 0 ? ` (${skipped} ohne E-Mail übersprungen)` : ""}.`,
        ),
      () => toast.error("Kopieren nicht möglich."),
    );
  }

  async function downloadSelectedCsv() {
    if (selectedCount === 0 || csvPending) return;
    const ids = selectedPersons.map((p) => p.id).join(",");
    setCsvPending(true);
    try {
      const res = await fetch(`/api/export/csv?ids=${ids}`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const filename =
        filenameFromDisposition(res.headers.get("Content-Disposition")) ?? "anschriften.csv";
      triggerBlobDownload(blob, filename);
    } catch {
      toast.error("CSV-Export fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setCsvPending(false);
    }
  }

  function submitAddToList() {
    if (targetListId == null || selectedCount === 0) return;
    const listId = Number(targetListId);
    const ids = selectedPersons.map((p) => p.id);
    startTransition(async () => {
      const res = await addMembers(listId, ids);
      if (!res.ok) return void toast.error(res.message);
      const listName = distributionLists.find((l) => l.id === listId)?.name ?? "Verteiler";
      toast.success(`${ids.length} zu „${listName}“ hinzugefügt.`);
      setAddToListOpen(false);
      setTargetListId(null);
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader
        title="Verzeichnis"
        subtitle={`${persons.length} ${persons.length === 1 ? "Anschrift" : "Anschriften"}`}
      />
      <div className="px-6 pt-[18px] pb-10">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <div className="relative w-full flex-1 sm:w-auto sm:max-w-[380px] sm:basis-[260px]">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-faint" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, Fahrtenname, Ort, E-Mail …"
              aria-label="Suche"
              className="pl-8"
            />
          </div>

          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-full sm:w-[220px]" aria-label="Gliederung filtern">
              <SelectValue placeholder="Alle Gliederungen" />
            </SelectTrigger>
            <SelectContent className="max-h-[360px]">
              <SelectItem value={ALL}>Alle Gliederungen</SelectItem>
              <GroupOptions ordered={orderedGroups} />
            </SelectContent>
          </Select>

          <Select value={officeFilter} onValueChange={setOfficeFilter}>
            <SelectTrigger className="w-full sm:w-[190px]" aria-label="Amt filtern">
              <SelectValue placeholder="Alle Ämter" />
            </SelectTrigger>
            <SelectContent className="max-h-[360px]">
              <SelectItem value={ALL}>Alle Ämter</SelectItem>
              {offices.map((o) => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {distributionLists.length > 0 ? (
            <Select value={listFilter} onValueChange={setListFilter}>
              <SelectTrigger className="w-full sm:w-[190px]" aria-label="Verteiler filtern">
                <SelectValue placeholder="Alle Verteiler" />
              </SelectTrigger>
              <SelectContent className="max-h-[360px]">
                <SelectItem value={ALL}>Alle Verteiler</SelectItem>
                {distributionLists.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Button asChild className="w-full sm:ml-auto sm:w-auto">
            <Link href="/personen/neu">
              <Plus className="size-4" />
              Neue Person
            </Link>
          </Button>
        </div>

        {selectedCount > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13px]">
            <span className="font-medium text-ink">{selectedCount} ausgewählt</span>
            <span className="text-ink-faint">—</span>
            {mailEnabled ? (
              <Button size="sm" onClick={() => setComposeOpen(true)}>
                <Send className="size-3.5" />
                E-Mail an Auswahl …
              </Button>
            ) : null}
            <Button size="sm" variant={mailEnabled ? "outline" : "default"} onClick={copySelectedEmails}>
              <Copy className="size-3.5" />
              E-Mails kopieren
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddToListOpen(true)}
              disabled={distributionLists.length === 0}
            >
              <UserPlus className="size-3.5" />
              Zu Verteiler hinzufügen …
            </Button>
            <Button size="sm" variant="outline" onClick={downloadSelectedCsv} disabled={csvPending}>
              <Download className="size-3.5" />
              {csvPending ? "CSV wird erzeugt …" : "CSV"}
            </Button>
            <button
              type="button"
              onClick={() => setRowSelection({})}
              className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-ink-faint transition-colors hover:text-ink"
            >
              <X className="size-3.5" />
              Auswahl aufheben
            </button>
          </div>
        ) : null}

        {/* Desktop (md and up): the dense table. Below md it is replaced by the
            card list further down — the 880px min width would otherwise force
            sideways scrolling on every single row on a phone.
            overflow-x-auto, not -hidden: between md and 880px the right-hand
            columns must stay reachable by scrolling. */}
        <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface shadow-sm md:block">
          <Table className="min-w-[880px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {table.getHeaderGroups()[0].headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className="border-b border-line-strong bg-surface-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-faint"
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 uppercase tracking-[0.09em] transition-colors hover:text-ink"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-50" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-10 text-center text-ink-faint">
                    <EmptyResult
                      hasPersons={persons.length > 0}
                      filtersActive={filtersActive}
                      onReset={resetFilters}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() => router.push(`/personen/${row.original.id}`)}
                    className="cursor-pointer border-line align-top hover:bg-sel"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="align-top py-2.5 text-[13.5px] whitespace-normal"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12.5px] tabular-nums text-ink-faint">
            <ResultSummary total={persons.length} shown={rows.length} selected={selectedCount} />
          </div>
        </div>

        {/* Mobile (below md): the very same TanStack rows as a stacked card
            list, so filtering, sorting and selection cannot drift apart. */}
        <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm md:hidden">
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13.5px] text-ink-faint">
              <EmptyResult
                hasPersons={persons.length > 0}
                filtersActive={filtersActive}
                onReset={resetFilters}
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-line-strong bg-surface-2 px-3 py-2">
                <Checkbox
                  aria-label="Alle auswählen"
                  checked={
                    table.getIsAllRowsSelected()
                      ? true
                      : table.getIsSomeRowsSelected()
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(v) => table.toggleAllRowsSelected(v === true)}
                />
                <span className="text-[11px] font-semibold tracking-[0.09em] uppercase text-ink-faint">
                  Alle auswählen
                </span>
              </div>
              <ul>
                {rows.map((row) => (
                  <PersonCard key={row.id} row={row} />
                ))}
              </ul>
            </>
          )}
          <div className="flex items-center justify-between border-t border-line px-3 py-2.5 text-[12.5px] tabular-nums text-ink-faint">
            <ResultSummary total={persons.length} shown={rows.length} selected={selectedCount} />
          </div>
        </div>
      </div>

      {/* Add selection to a distribution list */}
      <Dialog
        open={addToListOpen}
        onOpenChange={(o) => {
          setAddToListOpen(o);
          if (!o) setTargetListId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zu Verteiler hinzufügen</DialogTitle>
            <DialogDescription>
              {selectedCount} {selectedCount === 1 ? "Anschrift wird" : "Anschriften werden"} zum
              gewählten Verteiler hinzugefügt. Bereits enthaltene Mitglieder werden übersprungen.
            </DialogDescription>
          </DialogHeader>
          <Combobox
            aria-label="Verteiler wählen"
            options={distributionLists.map((l) => ({
              value: String(l.id),
              label: `${l.name} (${l.memberCount})`,
            }))}
            value={targetListId}
            onChange={setTargetListId}
            placeholder="Verteiler wählen"
            searchPlaceholder="Verteiler suchen …"
            emptyText="Kein Verteiler gefunden."
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isPending}>
                Abbrechen
              </Button>
            </DialogClose>
            <Button onClick={submitAddToList} disabled={isPending || targetListId == null}>
              {isPending ? "Hinzufügen …" : "Hinzufügen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compose mail to the current selection (optional mail module) */}
      {mailEnabled ? (
        <ComposeMailDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          target={{ kind: "selection", personIds: selectedPersons.map((p) => p.id) }}
          contextName={`die Auswahl (${selectedCount} ${selectedCount === 1 ? "Anschrift" : "Anschriften"})`}
          recipientCount={selectedBcc.count}
          skippedCount={selectedBcc.skipped}
          onSent={() => setRowSelection({})}
        />
      ) : null}
    </>
  );
}

/** Footer count, shared verbatim by the table and the mobile card list. */
function ResultSummary({
  total,
  shown,
  selected,
}: {
  total: number;
  shown: number;
  selected: number;
}) {
  return (
    <span>
      {total} Anschriften · {shown} gefiltert
      {selected > 0 ? ` · ${selected} ausgewählt` : ""}
    </span>
  );
}

/**
 * Empty message shared by both branches: distinguishes "nothing captured yet"
 * from "nothing matches the current filters" (which offers a way back).
 */
function EmptyResult({
  hasPersons,
  filtersActive,
  onReset,
}: {
  hasPersons: boolean;
  filtersActive: boolean;
  onReset: () => void;
}) {
  if (!hasPersons) return <>Noch keine Anschriften erfasst.</>;
  if (filtersActive) {
    return (
      <div className="flex flex-col items-center gap-2.5">
        <span>Keine Anschriften für die aktuelle Filterung.</span>
        <Button variant="outline" size="sm" onClick={onReset}>
          <X className="size-3.5" />
          Filter zurücksetzen
        </Button>
      </div>
    );
  }
  return <>Keine Anschriften gefunden.</>;
}

/**
 * One person as a stacked card (mobile branch). Driven by the same TanStack row
 * the table uses, so selection and sorting stay in one place. The name link
 * spans the card via a ::before overlay so the whole card is tappable; the
 * checkbox and the mailto link sit above it.
 */
function PersonCard({ row }: { row: Row<Indexed> }) {
  const p = row.original;
  const showScout = !!p.scoutName && !!(p.lastName || p.firstName);
  const sub = [p.rankName, birthYear(p.birthDate) ? `*${birthYear(p.birthDate)}` : null]
    .filter(Boolean)
    .join(" · ");
  const offices = p.assignments.filter((a) => a.officeName);
  const groupNames = distinct(p.assignments.map((a) => a.groupName));
  const phone = p.phones[0];

  return (
    <li className="relative border-b border-line last:border-b-0 hover:bg-sel">
      <div className="flex items-start gap-3 px-3 py-3">
        <div className="relative z-10 flex items-center pt-0.5">
          <Checkbox
            aria-label="Zeile auswählen"
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(v === true)}
          />
        </div>
        <div className="min-w-0 flex-1 text-[13.5px]">
          <Link
            href={`/personen/${p.id}`}
            className="rounded-sm font-medium text-ink outline-none transition-colors before:absolute before:inset-0 hover:text-fir focus-visible:ring-2 focus-visible:ring-ring"
          >
            {formatName(p)}
            {showScout ? (
              <span className="ml-1.5 font-normal text-ink-soft">„{p.scoutName}“</span>
            ) : null}
          </Link>
          {sub ? <div className="text-xs tabular-nums text-ink-faint">{sub}</div> : null}

          {offices.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {offices.map((a) => (
                <Badge
                  key={a.id}
                  variant="secondary"
                  className="rounded-[4px] border border-line font-normal text-ink-soft"
                >
                  {a.officeName}
                </Badge>
              ))}
            </div>
          ) : null}
          {groupNames.length > 0 ? (
            <div className="mt-1 text-[12.5px] text-ink-soft">{groupNames.join(" · ")}</div>
          ) : null}

          {p.email || phone ? (
            <div className="mt-1.5">
              {p.email ? (
                <a
                  href={`mailto:${p.email}`}
                  className="relative z-10 break-all text-fir hover:underline"
                >
                  {p.email}
                </a>
              ) : null}
              {phone ? (
                <div className="text-[12.5px] tabular-nums text-ink-soft">
                  {phone.number}
                  {phone.label ? ` · ${phone.label}` : ""}
                </div>
              ) : null}
            </div>
          ) : null}

          {p.doNotPrint || p.deathDate ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {p.doNotPrint ? (
                <span className="inline-block rounded-[4px] bg-crit-tint px-1.5 py-px text-[10.5px] font-semibold text-crit">
                  nicht abdrucken
                </span>
              ) : null}
              {p.deathDate ? <span className="text-[11px] text-ink-faint">verstorben</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Section-grouped, hierarchically indented options for the Gliederung filter. */
function GroupOptions({
  ordered,
}: {
  ordered: { group: GroupRow; depth: number }[];
}) {
  const bySection = new Map<string, { group: GroupRow; depth: number }[]>();
  for (const item of ordered) {
    if (!bySection.has(item.group.section)) bySection.set(item.group.section, []);
    bySection.get(item.group.section)!.push(item);
  }
  return (
    <>
      {[...bySection.entries()].map(([section, items]) => (
        <SelectGroup key={section}>
          <SelectLabel>{SECTION_LABELS[section] ?? section}</SelectLabel>
          {items.map(({ group, depth }) => (
            <SelectItem key={group.id} value={String(group.id)}>
              {" ".repeat(depth * 2)}
              {group.name}
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
}
