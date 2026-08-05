import { Combobox, type ComboOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { Field, OFFICE_NONE } from "./form-primitives";

// Add/edit dialog for a past tenure. `id` null = new entry.
export type HistForm = {
  id: number | null;
  groupId: number | null;
  officeId: number | null;
  startDate: string;
  endDate: string;
  endUnknown: boolean;
};

/** Dialog to add or edit a past tenure ("Früheres Amt"). */
export function HistoryDialog({
  form,
  onChange,
  onClose,
  onSubmit,
  pending,
  officeOptions,
  groupOptions,
}: {
  form: HistForm | null;
  onChange: (next: HistForm) => void;
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
  officeOptions: ComboOption[];
  groupOptions: ComboOption[];
}) {
  return (
    <Dialog open={form != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {form?.id != null ? "Früheres Amt bearbeiten" : "Früheres Amt hinzufügen"}
          </DialogTitle>
          <DialogDescription>
            Ein bereits beendetes Amt für die rückwirkende Erfassung. Bis-Datum angeben
            oder „Ende unbekannt“ wählen; das Von-Datum ist optional.
          </DialogDescription>
        </DialogHeader>
        {form ? (
          <div className="flex flex-col gap-3">
            <Field label="Amt">
              <Combobox
                aria-label="Amt"
                options={officeOptions}
                value={form.officeId != null ? String(form.officeId) : null}
                onChange={(v) =>
                  onChange({ ...form, officeId: v === OFFICE_NONE ? null : Number(v) })
                }
                placeholder="Amt (optional)"
                searchPlaceholder="Amt suchen …"
                emptyText="Kein Amt gefunden."
              />
            </Field>
            <Field label="Gliederung">
              <Combobox
                aria-label="Gliederung"
                options={groupOptions}
                value={form.groupId != null ? String(form.groupId) : null}
                onChange={(v) => onChange({ ...form, groupId: Number(v) })}
                placeholder="Gliederung wählen"
                searchPlaceholder="Gliederung suchen …"
                emptyText="Keine Gliederung gefunden."
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="von" htmlFor="f-hist-from">
                <Input
                  id="f-hist-from"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => onChange({ ...form, startDate: e.target.value })}
                />
              </Field>
              <Field label="bis" htmlFor="f-hist-to">
                <Input
                  id="f-hist-to"
                  type="date"
                  value={form.endUnknown ? "" : form.endDate}
                  disabled={form.endUnknown}
                  onChange={(e) => onChange({ ...form, endDate: e.target.value })}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-ink-soft">
              <Checkbox
                checked={form.endUnknown}
                onCheckedChange={(v) => onChange({ ...form, endUnknown: v === true })}
              />
              Ende unbekannt
            </label>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Abbrechen
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending ? "Speichern …" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
