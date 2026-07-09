"use client";

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
 * confirm button is disabled.
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
  const blocked = blockedMessage != null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{blocked ? blockedMessage : description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Abbrechen
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending || blocked}>
            {pending ? "Löschen …" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
