"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { GroupRow, OfficeRow, PersonListRow } from "@/db/queries";
import { SECTION_LABELS, birthYear, fold, formatName } from "@/lib/format";
import { orderGroups } from "@/lib/groups";

const ALL = "__all__";

function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

type Indexed = PersonListRow & { _search: string };

export function PersonsTable({
  persons,
  groups,
  offices,
}: {
  persons: PersonListRow[];
  groups: GroupRow[];
  offices: OfficeRow[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>(ALL);
  const [officeFilter, setOfficeFilter] = useState<string>(ALL);
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);

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
    return indexed.filter((p) => {
      if (q && !p._search.includes(q)) return false;
      if (groupId != null && !p.assignments.some((a) => a.groupId === groupId)) return false;
      if (officeId != null && !p.assignments.some((a) => a.officeId === officeId)) return false;
      return true;
    });
  }, [indexed, search, groupFilter, officeFilter]);

  const columns = useMemo<ColumnDef<Indexed>[]>(
    () => [
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
              <div className="font-medium whitespace-nowrap text-ink">
                {formatName(p)}
                {showScout ? (
                  <span className="ml-1.5 font-normal text-fir">„{p.scoutName}“</span>
                ) : null}
              </div>
              {sub ? <div className="text-xs text-ink-faint">{sub}</div> : null}
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
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <>
      <PageHeader
        title="Verzeichnis"
        subtitle={`${persons.length} ${persons.length === 1 ? "Anschrift" : "Anschriften"}`}
      />
      <div className="px-6 pt-[18px] pb-10">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <div className="relative max-w-[380px] flex-1 basis-[260px]">
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
            <SelectTrigger className="w-[220px]" aria-label="Gliederung filtern">
              <SelectValue placeholder="Alle Gliederungen" />
            </SelectTrigger>
            <SelectContent className="max-h-[360px]">
              <SelectItem value={ALL}>Alle Gliederungen</SelectItem>
              <GroupOptions ordered={orderedGroups} />
            </SelectContent>
          </Select>

          <Select value={officeFilter} onValueChange={setOfficeFilter}>
            <SelectTrigger className="w-[190px]" aria-label="Amt filtern">
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

          <Button asChild className="ml-auto">
            <Link href="/personen/neu">
              <Plus className="size-4" />
              Neue Anschrift
            </Link>
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
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
                    Keine Anschriften gefunden.
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
            <span>
              {persons.length} Anschriften · {rows.length} gefiltert
            </span>
          </div>
        </div>
      </div>
    </>
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
