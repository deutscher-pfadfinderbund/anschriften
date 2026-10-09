"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Shared confirmation dialog for destructive delete actions. When `blockedMessage`
 * is set the entry cannot be removed: its text replaces the description and the
 * confirm button is disabled. While it fades out, it keeps showing the text it had
 * while open: callers often derive `open` and the text from one state
 * (`removing != null`), which empties the moment closing starts.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  blockedMessage,
  confirmLabel = "Löschen",
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  blockedMessage?: React.ReactNode;
  confirmLabel?: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const content = { title, description, blockedMessage, confirmLabel };
  const [lastOpen, setLastOpen] = useState(content);
  if (open && (Object.keys(content) as (keyof typeof content)[]).some((k) => content[k] !== lastOpen[k]))
    setLastOpen(content);
  const shown = open ? content : lastOpen;
  const blocked = shown.blockedMessage != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{shown.title}</DialogTitle>
          <DialogDescription>{blocked ? shown.blockedMessage : shown.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Abbrechen
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending || blocked}>
            {pending ? "Löschen …" : shown.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
