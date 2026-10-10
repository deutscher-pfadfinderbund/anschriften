"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { AuditChanges } from "@/components/audit-changes";
import { Panel } from "@/components/panel";
import type { AuditEntry } from "@/db/queries";
import { formatDateTime } from "@/lib/format";
import { TOUCH_HIT, cn } from "@/lib/utils";

/** "Änderungsverlauf": who changed what on this person, newest first. Collapsed at first. */
export function ChangeLogPanel({ entries, className }: { entries: AuditEntry[]; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Panel
      className={className}
      title={
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(TOUCH_HIT, "group/toggle flex items-center gap-1.5 rounded-sm text-left")}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-4 text-ink-faint transition-[transform,color] group-hover/toggle:text-ink",
              open && "rotate-90",
            )}
          />
          Änderungsverlauf
          <span className="font-sans text-ui font-normal text-ink-faint tabular-nums">({entries.length})</span>
        </button>
      }
      description={open ? "Wer wann was an dieser Person geändert hat, die neueste Änderung zuerst." : undefined}
    >
      {open ? (
        entries.length === 0 ? (
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
        )
      ) : null}
    </Panel>
  );
}
