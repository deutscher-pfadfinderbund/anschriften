import { ACTION_LABEL, auditFieldLabel, type AuditAction, type AuditChange } from "@/lib/audit";

/**
 * One changed field: „Ort: Münster → Köln“ (the arrow read out as „neu:“), or just
 * „Ort: Münster“ in a new person's entry.
 */
function ChangeLine({ change, created }: { change: AuditChange; created: boolean }) {
  return (
    <li>
      <span className="text-ink-faint">{auditFieldLabel(change.field)}: </span>
      {created ? null : (
        <>
          <span className="text-ink-soft">{change.from ?? "—"}</span>
          <span aria-hidden className="text-ink-faint">
            {" → "}
          </span>
          <span className="sr-only"> neu: </span>
        </>
      )}
      <span className="text-ink">{change.to ?? "—"}</span>
    </li>
  );
}

/**
 * What one change-log entry changed, a line per field; „Person angelegt“ leads a new
 * person's entry. Values show in full (the log is the only place an old note survives),
 * a note with its line breaks.
 */
export function AuditChanges({ action, changes }: { action: AuditAction; changes: AuditChange[] }) {
  const created = action === "created";
  return (
    <div className="text-ui">
      {created ? <p className="font-medium text-ink">{ACTION_LABEL.created}</p> : null}
      {changes.length > 0 ? (
        <ul className="break-words whitespace-pre-line">
          {changes.map((c, i) => (
            <ChangeLine key={i} change={c} created={created} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
