import { AuditChanges } from "@/components/audit-changes";
import { Disclosure } from "@/components/disclosure";
import type { AuditEntry } from "@/db/queries";
import { formatDateTime, plural } from "@/lib/format";

/** "Änderungsverlauf": who changed what on this person, newest first. Collapsed at first. */
export function ChangeLogPanel({ entries, className }: { entries: AuditEntry[]; className?: string }) {
  return (
    <Disclosure
      summary={<h2>Änderungsverlauf</h2>}
      count={`${entries.length} ${plural(entries.length, "Änderung", "Änderungen")}`}
      className={className}
    >
      {entries.length === 0 ? (
        <p className="text-ui text-ink-faint">Noch keine Änderungen protokolliert.</p>
      ) : (
        <ol className="divide-y divide-line">
          {entries.map((e) => (
            <li key={e.id} className="py-2.5 first:pt-0 last:pb-0">
              <p className="mb-0.5 text-caption text-ink-faint tabular-nums">
                {formatDateTime(e.at)} · {e.actor}
              </p>
              <AuditChanges action={e.action} changes={e.changes} />
            </li>
          ))}
        </ol>
      )}
    </Disclosure>
  );
}
