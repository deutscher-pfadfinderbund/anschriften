"use client";

import { useRef, useState } from "react";
import { CalendarOff, Undo2 } from "lucide-react";

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
import { formatDate, todayIso } from "@/lib/format";
import { TOUCH_HIT, cn } from "@/lib/utils";

import { Field, fieldAria } from "./field";
import { endChoiceError, isEndChoiceReady, type EndChoice } from "./form-values";

/** "Bis" date plus „Ende unbekannt“, which disables the date (the server then records today). */
export function EndDateChoice({
  id,
  value,
  onChange,
  start,
  error: extraError,
}: {
  id: string;
  value: EndChoice;
  onChange: (next: EndChoice) => void;
  /** Start of the tenure: the earliest possible end. */
  start?: string | null;
  /** Shown when the choice itself is fine (e.g. "missing" after a submit attempt). */
  error?: string;
}) {
  const error = endChoiceError(value, start) ?? extraError;
  return (
    <div className="flex flex-col gap-3">
      <Field label="Bis" id={id} error={error}>
        <Input
          {...fieldAria(id, error)}
          type="date"
          value={value.endUnknown ? "" : value.endDate}
          min={start ?? undefined}
          max={todayIso()}
          disabled={value.endUnknown}
          onChange={(e) => onChange({ ...value, endDate: e.target.value })}
        />
      </Field>
      <label className="flex items-center gap-2.5 text-ui text-ink">
        <Checkbox
          checked={value.endUnknown}
          onCheckedChange={(v) => onChange({ ...value, endUnknown: v === true })}
        />
        Ende unbekannt
      </label>
    </div>
  );
}

/** What the end-date dialog is about to end. */
export type EndRequest = {
  title: string;
  description: React.ReactNode;
  /** Start of the tenure, if known: the earliest possible end. */
  start?: string | null;
  onConfirm: (end: EndChoice) => void;
  /** id to focus after confirming (the opener is gone then: it became a note). */
  focusAfter: string;
};

/**
 * The one dialog for ending a tenure — the person's own row ("Beenden") and a current
 * holder's (holder warning). It only hands the choice back; nothing is written until
 * the person is saved.
 */
export function EndDateDialog({ request, onClose }: { request: EndRequest | null; onClose: () => void }) {
  const focusAfter = useRef<string | null>(null);
  return (
    <Dialog open={request != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          const target = focusAfter.current ? document.getElementById(focusAfter.current) : null;
          focusAfter.current = null;
          if (target) {
            e.preventDefault();
            target.focus();
          }
        }}
      >
        {request ? (
          <EndDateForm
            request={request}
            onClose={onClose}
            onConfirmed={() => {
              focusAfter.current = request.focusAfter;
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// Mounted per opening, so every dialog starts at today.
function EndDateForm({
  request,
  onClose,
  onConfirmed,
}: {
  request: EndRequest;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [end, setEnd] = useState<EndChoice>(() => ({ endDate: todayIso(), endUnknown: false }));
  const ready = isEndChoiceReady(end, request.start);

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        // The dialog is portalled, but React still bubbles the submit to the person form.
        e.stopPropagation();
        if (!ready) return;
        request.onConfirm(end);
        onConfirmed();
        onClose();
      }}
    >
      <DialogHeader>
        <DialogTitle>{request.title}</DialogTitle>
        <DialogDescription>{request.description}</DialogDescription>
      </DialogHeader>
      <EndDateChoice id="end-date" value={end} onChange={setEnd} start={request.start} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={!ready}>
          Übernehmen
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Note box under an assignment row (holder warning, buffered ending). */
export function RowNote({
  icon: Icon,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-caption text-ink-soft">
      <Icon aria-hidden className="size-3.5 shrink-0 text-ink-faint" />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

/** Inline text button inside a RowNote. */
export function NoteButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        TOUCH_HIT,
        "inline-flex shrink-0 items-center gap-1 rounded-sm font-medium whitespace-nowrap transition-colors",
        className,
      )}
      {...props}
    />
  );
}

/** A buffered ending under its row ("Endet am …"), undoable until the person is saved. */
export function EndingNote({
  undoId,
  onUndo,
  children,
}: {
  undoId: string;
  onUndo: () => void;
  children: React.ReactNode;
}) {
  return (
    <RowNote
      icon={CalendarOff}
      action={
        <NoteButton id={undoId} onClick={onUndo} className="text-ink-soft hover:text-ink">
          <Undo2 aria-hidden className="size-3.5" />
          Rückgängig
        </NoteButton>
      }
    >
      {children}
    </RowNote>
  );
}

/** "endet am 09.10.2026" / "wird beendet (Ende unbekannt)" — the text of a buffered ending. */
export function endingText(end: EndChoice): string {
  return end.endUnknown ? "wird beendet (Ende unbekannt)" : `endet am ${formatDate(end.endDate)}`;
}
