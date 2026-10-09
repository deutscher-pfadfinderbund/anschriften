"use client";

// The building blocks the three master-data lists share (Ämter, Stände on /stammdaten,
// Gliederungen on /gliederungen): the list card, a row that opens its edit dialog, and that
// dialog with its Name and Reihenfolge fields. One recipe, so the lists look and behave alike.
import { useId, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FormError, TextField, focusSoon } from "@/components/field";
import { NumberBadge } from "@/components/number-badge";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-helpers";
import { callAction } from "@/lib/call-action";
import { NAME_MAX } from "@/lib/limits";
import { ORDER_MAX } from "@/lib/master-data";
import { cn } from "@/lib/utils";

/**
 * List card that hugs its content: an ordered list of entries, or the empty state (then
 * without the description, which explains the rows).
 */
export function EntryList({
  title,
  description,
  emptyState,
  children,
}: {
  title: string;
  description: string;
  /** Shown instead of the list when there are no entries. */
  emptyState: React.ReactNode | null;
  children: React.ReactNode;
}) {
  return (
    <Panel
      title={title}
      description={emptyState ? undefined : description}
      flush
      className="max-w-2xl overflow-hidden"
    >
      {emptyState ?? <ul className="divide-y divide-line">{children}</ul>}
    </Panel>
  );
}

/**
 * One entry, the whole row a button that opens the edit dialog. The order number sits
 * in a fixed first column; `depth` indents only the name, like a table of contents.
 * Screen readers get the name as the button's label, the number and details as its
 * description.
 */
export function EntryRow({
  order,
  orderLabel,
  name,
  depth = 0,
  meta,
  onOpen,
}: {
  /** The Reihenfolge; null shows „—“ (an Amt without one goes to the end). */
  order: number | null;
  /** What the number means, e.g. „Reihenfolge im PDF“. */
  orderLabel: string;
  name: string;
  depth?: number;
  /** Quiet details after the name (right-aligned; a second line on phones). */
  meta?: React.ReactNode;
  onOpen: () => void;
}) {
  const id = useId();
  const orderText = order == null ? "Ohne Reihenfolge – steht am Ende" : `${orderLabel}: ${order}`;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${name} bearbeiten`}
        aria-describedby={meta ? `${id}-order ${id}-meta` : `${id}-order`}
        className="group/row flex w-full cursor-pointer items-start gap-3 px-4 py-2 text-left transition-colors hover:bg-hover focus-visible:-outline-offset-2 active:bg-active sm:px-gutter"
      >
        <NumberBadge title={order == null ? orderText : orderLabel}>{order ?? "—"}</NumberBadge>
        <span id={`${id}-order`} className="sr-only">
          {orderText}.
        </span>
        <span
          className="flex min-w-0 flex-1 flex-col gap-x-3 gap-y-1 sm:flex-row sm:items-start"
          style={depth > 0 ? { paddingLeft: depth * 16 } : undefined}
        >
          <span className="min-w-0 text-ui text-ink">{name}</span>
          {meta ? (
            <span
              id={`${id}-meta`}
              className="flex min-w-0 flex-wrap items-center gap-1 text-caption text-ink-faint sm:ml-auto sm:justify-end"
            >
              {meta}
            </span>
          ) : null}
        </span>
        <Pencil
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-ink-faint transition-colors group-hover/row:text-ink"
        />
      </button>
    </li>
  );
}

/**
 * State of a create/edit dialog: what it edits, which view is up (form or delete
 * confirmation), the server's last refusal and the action in flight.
 */
export function useEntryDialog<D extends object>(initial: D) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [confirming, setConfirmingState] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return {
    open,
    draft,
    pending,
    confirming,
    error,
    /** Opens the dialog on this draft, in its form view. */
    show(next: D) {
      setDraft(next);
      setConfirmingState(false);
      setError(null);
      setOpen(true);
    },
    /** Changes fields; the server's refusal of the previous input no longer applies. */
    edit(patch: Partial<D>) {
      setDraft((d) => ({ ...d, ...patch }));
      setError(null);
    },
    close() {
      setOpen(false);
    },
    /** Switches between the form and the delete confirmation. */
    setConfirming(next: boolean) {
      setConfirmingState(next);
      setError(null);
    },
    /**
     * Runs a save or delete: success toasts and closes the dialog; a refusal keeps it
     * open on the same view with the server's message, ready for another try.
     */
    run(action: () => Promise<ActionResult>, success: string) {
      setError(null);
      startTransition(async () => {
        const res = await callAction(action);
        if (!res.ok) return setError(res.message);
        toast.success(success);
        setOpen(false);
      });
    },
  };
}

type EntryDialogState = ReturnType<typeof useEntryDialog<object>>;

/** Löschen in an edit dialog. */
type Deletion = {
  /** e.g. „Amt löschen?“ */
  title: string;
  description: string;
  /** Why the entry cannot be deleted (the page's up-front check): Löschen stays disabled. */
  blockedReason?: string;
  onConfirm: () => void;
};

/**
 * Create/edit dialog as a real form: Enter saves, Speichern stays disabled until the
 * input is valid, and a refused save shows the server's message here instead of a
 * toast. `deletion` (edit mode only) adds Löschen on the left of the footer, which swaps
 * the form for a confirmation in the same dialog; Abbrechen or Escape there return to
 * the form. While an action runs the dialog cannot be dismissed, so its answer is
 * never lost.
 */
export function EntryDialog({
  state,
  title,
  description,
  className,
  canSave,
  onSubmit,
  deletion,
  children,
}: {
  state: Pick<EntryDialogState, "open" | "pending" | "confirming" | "error" | "close" | "setConfirming">;
  title: string;
  description: string;
  /** Extra classes for the dialog panel, e.g. a wider max width. */
  className?: string;
  canSave: boolean;
  onSubmit: () => void;
  deletion?: Deletion;
  children: React.ReactNode;
}) {
  const { open, pending, confirming, error, close, setConfirming } = state;
  const id = useId();
  const confirmation = confirming && deletion ? deletion : null;

  function backToForm() {
    setConfirming(false);
    focusSoon(`${id}-delete`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) close();
      }}
    >
      <DialogContent
        className={className}
        onEscapeKeyDown={(e) => {
          if (!confirmation) return;
          e.preventDefault();
          if (!pending) backToForm();
        }}
      >
        {confirmation ? (
          // A group named like the question, so screen readers announce the switch when
          // focus lands on Abbrechen.
          <div
            role="group"
            aria-label={confirmation.title}
            aria-describedby={`${id}-confirm`}
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle>{confirmation.title}</DialogTitle>
              <DialogDescription>
                <span id={`${id}-confirm`}>{confirmation.description}</span>
              </DialogDescription>
            </DialogHeader>
            <FormError>{error}</FormError>
            <DialogFooter>
              <Button variant="outline" onClick={backToForm} disabled={pending} autoFocus>
                Abbrechen
              </Button>
              <Button variant="destructive" onClick={confirmation.onConfirm} disabled={pending}>
                {pending ? "Löschen …" : "Löschen"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            noValidate
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSave && !pending) onSubmit();
            }}
          >
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">{children}</div>
            <FormError>{error}</FormError>
            <DialogFooter className="sm:flex-wrap">
              {deletion ? (
                <Button
                  id={`${id}-delete`}
                  type="button"
                  variant="ghost"
                  className="text-crit hover:bg-crit-tint hover:text-crit sm:mr-auto"
                  onClick={() => setConfirming(true)}
                  disabled={pending || deletion.blockedReason != null}
                  aria-describedby={deletion.blockedReason ? `${id}-blocked` : undefined}
                >
                  <Trash2 aria-hidden />
                  Löschen
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={close} disabled={pending}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={!canSave || pending}>
                {pending ? "Speichern …" : "Speichern"}
              </Button>
              {/* Under the disabled Löschen: below the button row, or below the stacked
                  buttons on phones (where the footer runs in reverse). */}
              {deletion?.blockedReason ? (
                <p
                  id={`${id}-blocked`}
                  className="order-first basis-full text-caption text-ink-faint sm:order-last"
                >
                  {deletion.blockedReason}
                </p>
              ) : null}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A master-data text field with the server's length limits; `numeric` for a Reihenfolge. */
export function EntryField({
  numeric = false,
  error,
  ...props
}: Omit<React.ComponentProps<typeof TextField>, "error" | "maxLength" | "inputMode"> & {
  error?: string | null;
  /** Digits only: numeric keyboard on phones, tabular figures. */
  numeric?: boolean;
}) {
  return (
    <TextField
      {...props}
      error={error ?? undefined}
      maxLength={numeric ? String(ORDER_MAX).length : NAME_MAX}
      inputMode={numeric ? "numeric" : undefined}
      autoComplete="off"
      className={cn(numeric && "[&_input]:w-28 [&_input]:tabular-nums")}
    />
  );
}
