"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { saveList } from "@/actions/lists";
import { Field, FormError, TextField } from "@/components/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { callAction } from "@/lib/call-action";
import { DESCRIPTION_MAX, NAME_MAX } from "@/lib/limits";

/** What the dialog edits: a new list (`id` null) or an existing one. */
export type ListDraft = { id: number | null; name: string; description: string };

/** "Neuer Verteiler" / "Verteiler bearbeiten", open while there is a `draft`. */
export function ListFormDialog({
  draft,
  onClose,
  onSaved,
}: {
  draft: ListDraft | null;
  onClose: () => void;
  /** Called with the saved list's id (to select a newly created list). */
  onSaved: (id: number) => void;
}) {
  return (
    <Dialog open={draft != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {draft ? <ListForm draft={draft} onCancel={onClose} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** Mounted per opening (the dialog unmounts its content when closed), so it starts from `draft`. */
function ListForm({
  draft,
  onCancel,
  onSaved,
}: {
  draft: ListDraft;
  onCancel: () => void;
  onSaved: (id: number) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [error, setError] = useState<string | null>(null);
  const isNew = draft.id == null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      const res = await callAction(() => saveList(draft.id, { name, description: description || null }));
      if (!res.ok) return void setError(res.message);
      toast.success(isNew ? "Verteiler angelegt." : "Verteiler gespeichert.");
      onSaved(res.id);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{isNew ? "Neuer Verteiler" : "Verteiler bearbeiten"}</DialogTitle>
        <DialogDescription>
          Ein Verteiler bündelt Personen für Rundmails, BCC-Listen und Serienbriefe.
        </DialogDescription>
      </DialogHeader>
      <TextField
        label="Name"
        id="verteiler-name"
        autoFocus
        maxLength={NAME_MAX}
        value={name}
        onValueChange={(v) => {
          setName(v);
          setError(null);
        }}
        placeholder="z. B. Bundesthing"
      />
      <Field label="Beschreibung (optional)" id="verteiler-beschreibung">
        <Textarea
          id="verteiler-beschreibung"
          maxLength={DESCRIPTION_MAX}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Wofür wird dieser Verteiler verwendet?"
        />
      </Field>
      <FormError>{error}</FormError>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={isPending || !name.trim()}>
          {isPending ? "Wird gespeichert …" : isNew ? "Anlegen" : "Speichern"}
        </Button>
      </DialogFooter>
    </form>
  );
}
