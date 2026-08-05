import { FormLabel } from "@/components/form-label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export const NONE = "none";
export const OFFICE_NONE = "none";

export const todayIso = () => new Date().toISOString().slice(0, 10);

export type PhoneRow = { key: string; label: string; number: string };

// `id` is the persisted assignment id (null for a freshly added row). Only persisted
// active rows can be "ended" (they need a DB row to move into the history).
export type AssignmentRow = {
  key: string;
  id: number | null;
  groupId: number | null;
  officeId: number | null;
  startDate: string;
  // Optional "bis": a row with an end date is saved as a finished tenure (history),
  // so past offices can be captured directly — also when creating a new person.
  endDate: string;
};

// --- small presentational helpers -----------------------------------------

export function Field({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <FormLabel htmlFor={htmlFor}>{label}</FormLabel>
      {children}
      {error ? <p className="mt-1 text-xs text-crit">{error}</p> : null}
    </div>
  );
}

export function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-line px-[18px] py-3 font-display text-[15.5px] font-semibold text-ink">
        <span>{title}</span>
        {hint ? <span className="font-sans text-xs font-normal text-ink-faint">{hint}</span> : null}
      </div>
      <div className="p-[18px]">{children}</div>
    </section>
  );
}

/**
 * "Bis"-Datum plus an "Ende unbekannt" checkbox (issue #26). Ticking it disables the
 * date field; the server then records end_date = today and end_unknown = true.
 */
export function EndDateChoice({
  idPrefix,
  endDate,
  endUnknown,
  onDate,
  onUnknown,
}: {
  idPrefix: string;
  endDate: string;
  endUnknown: boolean;
  onDate: (v: string) => void;
  onUnknown: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Field label="Bis" htmlFor={`${idPrefix}-date`}>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          value={endUnknown ? "" : endDate}
          disabled={endUnknown}
          onChange={(e) => onDate(e.target.value)}
        />
      </Field>
      <label className="flex items-center gap-2 text-[13px] text-ink-soft">
        <Checkbox checked={endUnknown} onCheckedChange={(v) => onUnknown(v === true)} />
        Ende unbekannt
      </label>
    </div>
  );
}
