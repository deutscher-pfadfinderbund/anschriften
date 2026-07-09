import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { EndDateChoice } from "./form-primitives";

// Active row being ended via the "Amt beenden…" dialog (only persisted rows).
// `endUnknown` toggles "Datum unbekannt" (disables the date field).
export type EndTarget = {
  key: string;
  id: number;
  endDate: string;
  endUnknown: boolean;
};

/** Dialog to end an active tenure → moves it into the history. */
export function EndTenureDialog({
  target,
  onChange,
  onClose,
  onConfirm,
  pending,
}: {
  target: EndTarget | null;
  onChange: (next: EndTarget) => void;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={target != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Amt beenden</DialogTitle>
          <DialogDescription>
            Das Amt wird zum angegebenen Datum beendet und wandert in „Frühere Ämter“. Der
            Eintrag bleibt erhalten, zählt aber nicht mehr für Verzeichnis, PDF und Verteiler.
          </DialogDescription>
        </DialogHeader>
        {target ? (
          <EndDateChoice
            idPrefix="f-end"
            endDate={target.endDate}
            endUnknown={target.endUnknown}
            onDate={(v) => onChange({ ...target, endDate: v })}
            onUnknown={(v) => onChange({ ...target, endUnknown: v })}
          />
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Abbrechen
          </Button>
          <Button
            onClick={onConfirm}
            disabled={pending || (!target?.endUnknown && !target?.endDate)}
          >
            {pending ? "Beenden …" : "Amt beenden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
