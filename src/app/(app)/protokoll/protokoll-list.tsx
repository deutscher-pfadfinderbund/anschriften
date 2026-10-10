"use client";

import { useState } from "react";
import Link from "next/link";
import { History, Search, SearchX, X } from "lucide-react";

import { AuditChanges } from "@/components/audit-changes";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuditLogRow } from "@/db/queries";
import { auditFieldLabel } from "@/lib/audit";
import { formatDateTime, plural } from "@/lib/format";
import { matchesQuery } from "@/lib/utils";

const DELETED = "Eine Person wurde gelöscht";

/** Everything the search looks at: person, who, when and every changed field and value. */
function searchText(e: AuditLogRow): string {
  return [
    e.person ? `${e.person.name} ${e.person.scout ?? ""}` : DELETED,
    e.actor,
    formatDateTime(e.at),
    e.action === "created" ? "Person angelegt" : "",
    ...e.changes.flatMap((c) => [auditFieldLabel(c.field), c.from ?? "", c.to ?? ""]),
  ].join(" ");
}

/** One entry: when and who, the person (a link) and what changed. */
function EntryRow({ entry }: { entry: AuditLogRow }) {
  return (
    <li className="grid items-baseline gap-x-6 gap-y-1 px-4 py-3 sm:px-gutter md:grid-cols-[9.5rem_minmax(0,14rem)_minmax(0,1fr)]">
      <p className="text-caption text-ink-faint tabular-nums">
        {formatDateTime(entry.at)}
        <span className="md:block">
          <span className="md:hidden"> · </span>
          {entry.actor}
        </span>
      </p>
      <p className="text-ui">
        {entry.person ? (
          <Link
            href={`/personen/${entry.person.id}`}
            prefetch={false}
            className="rounded-sm font-medium text-ink transition-colors hover:text-fir"
          >
            {entry.person.name}
            {entry.person.scout ? <span className="font-normal text-ink-soft"> „{entry.person.scout}“</span> : null}
          </Link>
        ) : (
          <span className="text-ink-soft">{DELETED}</span>
        )}
      </p>
      <AuditChanges action={entry.action} changes={entry.changes} />
    </li>
  );
}

/** The latest changes, newest first, with a search over person, who and what. */
export function ProtokollList({ entries, limit }: { entries: AuditLogRow[]; limit: number }) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const shown = q ? entries.filter((e) => matchesQuery(searchText(e), q)) : entries;
  const total =
    entries.length >= limit
      ? `Die letzten ${limit} Änderungen`
      : `${entries.length} ${plural(entries.length, "Änderung", "Änderungen")}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-faint"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, Feld oder Wert …"
            aria-label="Protokoll durchsuchen"
            className="pl-8"
          />
        </div>
        <p role="status" className="text-caption text-ink-soft tabular-nums sm:ml-auto">
          {q ? `${shown.length} von ${entries.length} angezeigt` : total}
        </p>
      </div>

      <div className="overflow-clip rounded-lg border border-line bg-surface">
        {entries.length === 0 ? (
          <EmptyState
            icon={History}
            title="Noch keine Änderungen protokolliert."
            description="Sobald jemand eine Person anlegt, ändert oder löscht, steht es hier."
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Keine Änderung gefunden."
            description={`Nichts passt zu „${q}“.`}
            action={
              <Button variant="outline" onClick={() => setQuery("")}>
                <X />
                Suche leeren
              </Button>
            }
          />
        ) : (
          <ol className="divide-y divide-line">
            {shown.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
