import { auditFieldLabel, type AuditAction, type AuditChange } from "@/lib/audit";
import { cn } from "@/lib/utils";

/** The arrow between old and new value (read out as „neu:“). */
function Arrow() {
  return (
    <>
      <span aria-hidden className="text-ink-faint">
        {" → "}
      </span>
      <span className="sr-only"> neu: </span>
    </>
  );
}

/**
 * One changed field: „Ort: Münster → Köln“, or just „Ort: Münster“ in a new person's
 * entry. A note can be long, so its values take a line each, clamped to two (in full on
 * hover).
 */
function ChangeLine({ change, created }: { change: AuditChange; created: boolean }) {
  const label = <span className="text-ink-faint">{auditFieldLabel(change.field)}: </span>;
  const from = change.from ?? "—";
  const to = change.to ?? "—";
  if (change.field !== "notes")
    return (
      <li>
        {label}
        {created ? null : (
          <>
            <span className="text-ink-soft">{from}</span>
            <Arrow />
          </>
        )}
        <span className="text-ink">{to}</span>
      </li>
    );
  const clamped = "block line-clamp-2";
  return (
    <li>
      {label}
      {created ? null : (
        // An empty old note stays on the label's line: „Anmerkung: —“.
        <span title={from} className={cn(change.from != null && clamped, "text-ink-soft")}>
          {from}
        </span>
      )}
      <span title={to} className={cn(clamped, "text-ink")}>
        {created ? null : <Arrow />}
        {to}
      </span>
    </li>
  );
}

/** What one change-log entry changed, a line per field; „Person angelegt“ leads a new person's entry. */
export function AuditChanges({ action, changes }: { action: AuditAction; changes: AuditChange[] }) {
  const created = action === "created";
  return (
    <div className="text-ui">
      {created ? <p className="font-medium text-ink">Person angelegt</p> : null}
      {changes.length > 0 ? (
        <ul className="break-words">
          {changes.map((c, i) => (
            <ChangeLine key={i} change={c} created={created} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
