"use client";

import { memo, useDeferredValue, useMemo, useState } from "react";
import { History, SearchX, X } from "lucide-react";

import { AuditChanges } from "@/components/audit-changes";
import { EmptyState } from "@/components/empty-state";
import { focusSoonIfKeyboard } from "@/components/field";
import { PersonLink } from "@/components/person-link";
import { SearchField } from "@/components/search-field";
import { Button } from "@/components/ui/button";
import type { AuditLogRow } from "@/db/queries";
import { ACTION_LABEL, auditFieldLabel } from "@/lib/audit";
import { fold, formatDateTime, formatNameWithScout, plural } from "@/lib/format";
import { matchesWords, queryWords } from "@/lib/utils";

const SEARCH_ID = "protokoll-suche";

/** Everything the search looks at: person, who, when and every changed field and value. */
function searchText(e: AuditLogRow): string {
  return [
    e.person ? formatNameWithScout(e.person) : "",
    e.actor,
    formatDateTime(e.at),
    ACTION_LABEL[e.action] ?? "",
    ...e.changes.flatMap((c) => [auditFieldLabel(c.field), c.from ?? "", c.to ?? ""]),
  ].join(" ");
}

/** One entry: when and who, the person (a link) and what changed. Memoized: a keystroke does not re-render it. */
const EntryRow = memo(function EntryRow({ entry }: { entry: AuditLogRow }) {
  return (
    <li className="grid grid-cols-1 items-baseline gap-x-6 gap-y-1 px-4 py-3 sm:px-gutter md:grid-cols-[9.5rem_minmax(0,14rem)_minmax(0,1fr)]">
      <p className="text-caption text-ink-faint tabular-nums">
        {formatDateTime(entry.at)}
        <span className="md:block">
          <span className="md:hidden"> · </span>
          {entry.actor}
        </span>
      </p>
      <p className="text-ui">
        {entry.person ? (
          <PersonLink person={entry.person} />
        ) : (
          <span className="text-ink-soft">{ACTION_LABEL.deleted}</span>
        )}
      </p>
      <AuditChanges action={entry.action} changes={entry.changes} />
    </li>
  );
});

/** The latest changes, newest first, with a search over person, who and what. */
export function ProtokollList({ entries, limit }: { entries: AuditLogRow[]; limit: number }) {
  const [query, setQuery] = useState("");
  // As in the directory: the texts are folded once, the field updates on every keystroke
  // and the list follows in a deferred render.
  const index = useMemo(() => entries.map((e) => fold(searchText(e))), [entries]);
  const q = useDeferredValue(query).trim();
  const shown = useMemo(() => {
    const words = queryWords(q);
    return q ? entries.filter((_, i) => matchesWords(index[i], words)) : entries;
  }, [entries, index, q]);
  if (entries.length === 0)
    return (
      <div className="rounded-lg border border-line bg-surface">
        <EmptyState
          icon={History}
          title="Noch keine Änderungen protokolliert."
          description="Sobald jemand eine Person anlegt, ändert oder löscht, steht es hier."
        />
      </div>
    );

  // Only the latest `limit` entries are loaded, so the search covers only those.
  const capped = entries.length >= limit;
  const status = q
    ? `${shown.length} von ${capped ? `den letzten ${limit}` : entries.length} angezeigt`
    : capped
      ? `Die letzten ${limit} Änderungen`
      : `${entries.length} ${plural(entries.length, "Änderung", "Änderungen")}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SearchField
          id={SEARCH_ID}
          label="Änderungsprotokoll durchsuchen"
          placeholder="Name, Feld oder Wert …"
          value={query}
          onChange={setQuery}
          className="sm:w-72"
        />
        <p role="status" className="text-caption text-ink-soft tabular-nums sm:ml-auto">
          {status}
        </p>
      </div>

      <div className="overflow-clip rounded-lg border border-line bg-surface">
        {shown.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Keine Änderung gefunden."
            description={
              capped
                ? `Nichts passt zu „${q}“ in den letzten ${limit} Änderungen. Ältere Änderungen stehen im Änderungsverlauf der Person.`
                : `Nichts passt zu „${q}“.`
            }
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  // The button unmounts: keyboard users continue in the search field.
                  focusSoonIfKeyboard(SEARCH_ID);
                }}
              >
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
