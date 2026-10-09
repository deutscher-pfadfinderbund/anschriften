"use client";

// The building blocks the three master-data lists share (Ämter, Stände on /stammdaten,
// Gliederungen on /gliederungen): the list card, a row that opens its edit dialog, and that
// dialog with its Name and Reihenfolge fields. One recipe, so the lists look and behave alike.
import { Pencil, Trash2 } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { FormLabel } from "@/components/form-label";
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
import { Input } from "@/components/ui/input";
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
 */
export function EntryRow({
  order,
  orderTitle,
  name,
  depth = 0,
  meta,
  onOpen,
}: {
  /** The Reihenfolge (or a placeholder like „—“). */
  order: React.ReactNode;
  /** Tooltip on the number: what it means. */
  orderTitle: string;
  name: string;
  depth?: number;
  /** Quiet details after the name (right-aligned; a second line on phones). */
  meta?: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${name} bearbeiten`}
        className="group/row flex w-full cursor-pointer items-start gap-3 px-4 py-2 text-left transition-colors hover:bg-hover focus-visible:-outline-offset-2 active:bg-active sm:px-gutter"
      >
        <NumberBadge title={orderTitle}>{order}</NumberBadge>
        <span
          className="flex min-w-0 flex-1 flex-col gap-x-3 gap-y-1 sm:flex-row sm:items-start"
          style={depth > 0 ? { paddingLeft: depth * 16 } : undefined}
        >
          <span className="min-w-0 text-ui text-ink">{name}</span>
          {meta ? (
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-caption text-ink-faint sm:ml-auto sm:justify-end">
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

/** Löschen in an edit dialog and its confirmation. */
export type Deletion = {
  /** e.g. „Amt löschen?“ */
  title: string;
  description: string;
  /** Why the entry cannot be deleted: the page's up-front check, or the server's refusal. */
  blockedMessage?: string;
  /** Confirmation shown. Reset it when the dialog opens; a successful delete only closes the dialog. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

/**
 * Create/edit dialog as a real form: Enter saves, Speichern stays disabled until the
 * input is valid, and a refused save shows the server's message here instead of a
 * toast. `deletion` (edit mode only) adds Löschen on the left of the footer; its
 * confirmation takes this dialog's place and returns here on Abbrechen.
 */
export function EntryDialog({
  open,
  onOpenChange,
  title,
  description,
  className,
  canSave,
  pending,
  error,
  onSubmit,
  deletion,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Extra classes for the dialog panel, e.g. a wider max width. */
  className?: string;
  canSave: boolean;
  pending: boolean;
  /** The server's message after a refused save. */
  error: string | null;
  onSubmit: () => void;
  deletion?: Deletion;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* While the confirmation is up, this dialog steps aside instead of showing a
          second set of buttons behind it; Abbrechen there brings it back. */}
      <DialogContent className={cn(className, deletion?.open && "invisible")}>
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
          {error ? (
            <p role="alert" className="text-ui text-crit">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            {deletion ? (
              <Button
                type="button"
                variant="ghost"
                className="text-crit hover:bg-crit-tint hover:text-crit sm:mr-auto"
                onClick={() => deletion.onOpenChange(true)}
                disabled={pending}
              >
                <Trash2 aria-hidden />
                Löschen
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={!canSave || pending}>
              {pending ? "Speichern …" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
        {/* Rendered inside this dialog's React tree on purpose: Radix then treats clicks
            in the confirmation as inside, so its Abbrechen does not dismiss both. After a
            delete the caller just closes this dialog: the confirmation fades out with it
            while this one stays hidden. */}
        {deletion ? (
          <ConfirmDeleteDialog
            open={open && deletion.open}
            onOpenChange={deletion.onOpenChange}
            title={deletion.title}
            description={deletion.description}
            blockedMessage={deletion.blockedMessage}
            pending={pending}
            onConfirm={deletion.onConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Label, text input and a hint that an error replaces, wired up for screen readers. */
export function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
  numeric = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string | null;
  placeholder?: string;
  /** Digits only: numeric keyboard on phones, tabular figures. */
  numeric?: boolean;
}) {
  const note = error ?? hint;
  return (
    <div>
      <FormLabel htmlFor={id}>{label}</FormLabel>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        // Mirrors the server's 200-character limit on names and the Art.
        maxLength={numeric ? 5 : 200}
        inputMode={numeric ? "numeric" : undefined}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? `${id}-note` : undefined}
        className={cn(numeric && "w-28 tabular-nums")}
      />
      {note ? (
        <p id={`${id}-note`} className={cn("mt-1 text-caption", error ? "text-crit" : "text-ink-faint")}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
