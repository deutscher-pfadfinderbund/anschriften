"use client";

import { useMemo, useState, useTransition } from "react";
import { Building2, Plus } from "lucide-react";
import { toast } from "sonner";

import { deleteGroup, saveGroup } from "@/actions/groups";
import { EntryDialog, EntryList, EntryRow, TextField } from "@/app/(app)/stammdaten/_components/master-data-ui";
import { Combobox, type ComboOption } from "@/components/combobox";
import { EmptyState } from "@/components/empty-state";
import { FormLabel } from "@/components/form-label";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GroupRow } from "@/db/queries";
import { descendantIds, orderGroups } from "@/lib/groups";
import { isDuplicateName, nextOrder, orderError, parseOrder } from "@/lib/master-data";
import { SECTIONS, SECTION_LABELS, type Section } from "@/lib/sections";

const PARENT_NONE = "none";

type Draft = {
  /** The group being edited, null when creating. */
  group: GroupRow | null;
  name: string;
  kind: string;
  order: string;
  parentId: number | null;
  /** Only decisive for a top-level group: a child always takes its parent's Bereich. */
  section: Section;
};

export function GliederungenManager({
  groups,
  blockers,
}: {
  groups: GroupRow[];
  /** Per group id: why it cannot be deleted (absent = deletable), same rule as the action. */
  blockers: Record<number, string>;
}) {
  const [isPending, startTransition] = useTransition();
  const ordered = useMemo(() => orderGroups(groups), [groups]);

  // `open` is kept apart from the draft so the dialog keeps its content while it fades out.
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    group: null,
    name: "",
    kind: "",
    order: "",
    parentId: null,
    section: "bund",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The server's refusal, when a delete the page thought possible was refused after all.
  const [deleteRefusal, setDeleteRefusal] = useState<string | null>(null);

  const editId = draft.group?.id ?? null;
  const parentOptions: ComboOption[] = useMemo(() => {
    // A group cannot move below itself or its own subtree (the action refuses cycles).
    const forbidden = editId != null ? descendantIds(groups, editId).add(editId) : new Set<number>();
    return [
      { value: PARENT_NONE, label: "keine (oberste Ebene)" },
      ...ordered
        .filter(({ group }) => !forbidden.has(group.id))
        .map(({ group, depth }) => ({ value: String(group.id), label: group.name, depth })),
    ];
  }, [groups, ordered, editId]);

  const parent = draft.parentId != null ? groups.find((g) => g.id === draft.parentId) : undefined;
  const hasChildren = editId != null && groups.some((g) => g.parentId === editId);
  const nameTaken = isDuplicateName(draft.name, groups, editId);
  const orderErr = orderError(draft.order);

  function openDialog(group: GroupRow | null) {
    setDraft(
      group
        ? {
            group,
            name: group.name,
            kind: group.kind ?? "",
            order: String(group.sortKey),
            parentId: group.parentId,
            section: group.section,
          }
        : {
            group: null,
            name: "",
            kind: "",
            order: String(nextOrder(groups.map((g) => g.sortKey))),
            parentId: null,
            section: "bund",
          },
    );
    setFormError(null);
    setConfirmOpen(false);
    setOpen(true);
  }

  function submit() {
    const { group, name, kind, parentId } = draft;
    const payload = {
      name,
      kind,
      sortKey: parseOrder(draft.order) ?? 0,
      parentId,
      // For a child the action takes the parent's Bereich anyway; send the one shown.
      section: parent?.section ?? draft.section,
    };
    setFormError(null);
    startTransition(async () => {
      const res = await saveGroup(group?.id ?? null, payload);
      if (!res.ok) return setFormError(res.message);
      toast.success(group ? "Gliederung gespeichert." : "Gliederung angelegt.");
      setOpen(false);
    });
  }

  function confirmDelete() {
    const { group } = draft;
    if (!group) return;
    startTransition(async () => {
      const res = await deleteGroup(group.id);
      // Keep the confirmation open and let it say why (e.g. a person assigned meanwhile).
      if (!res.ok) return setDeleteRefusal(res.message);
      toast.success("Gliederung gelöscht.");
      setOpen(false); // takes the confirmation with it
    });
  }

  return (
    <>
      <PageHeader
        title="Gliederungen"
        subtitle="Aufbau des Bundes · Grundlage für Personen, Verteiler und den PDF-Druck"
        actions={
          <Button onClick={() => openDialog(null)}>
            <Plus aria-hidden />
            Neue Gliederung
          </Button>
        }
      />
      <PageBody>
        <EntryList
          title="Reihenfolge im PDF"
          description="Kleiner = weiter oben, Untergliederungen eingerückt. Zum Bearbeiten auf eine Gliederung klicken."
          emptyState={
            ordered.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="Noch keine Gliederungen angelegt."
                description="Lege mit „Neue Gliederung“ die erste Gliederung an. Sie steht danach bei Personen, Verteilern und im PDF zur Verfügung."
              />
            ) : null
          }
        >
          {ordered.map(({ group, depth }) => (
            <EntryRow
              key={group.id}
              order={group.sortKey}
              orderTitle="Reihenfolge im PDF"
              name={group.name}
              depth={depth}
              // The Bereich belongs to the whole branch, so only its top row names it.
              meta={[group.kind, depth === 0 ? SECTION_LABELS[group.section] : null]
                .filter(Boolean)
                .join(" · ")}
              onOpen={() => openDialog(group)}
            />
          ))}
        </EntryList>
      </PageBody>

      <EntryDialog
        open={open}
        onOpenChange={setOpen}
        title={draft.group ? "Gliederung bearbeiten" : "Neue Gliederung"}
        description="Gliederungen stehen bei Personen, Verteilern und im PDF zur Auswahl."
        className="sm:max-w-md"
        canSave={draft.name.trim() !== "" && !nameTaken && orderErr == null}
        pending={isPending}
        error={formError}
        onSubmit={submit}
        deletion={
          draft.group
            ? {
                title: "Gliederung löschen?",
                description: `„${draft.group.name}“ wird gelöscht. Das kann nicht rückgängig gemacht werden.`,
                blockedMessage: deleteRefusal ?? blockers[draft.group.id],
                open: confirmOpen,
                onOpenChange: (o) => {
                  if (o) setDeleteRefusal(null);
                  setConfirmOpen(o);
                },
                onConfirm: confirmDelete,
              }
            : undefined
        }
      >
        <TextField
          id="group-name"
          label="Name"
          value={draft.name}
          onChange={(name) => setDraft((d) => ({ ...d, name }))}
          error={nameTaken ? "Eine Gliederung mit diesem Namen gibt es schon." : null}
        />
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <TextField
            id="group-kind"
            label="Art"
            value={draft.kind}
            onChange={(kind) => setDraft((d) => ({ ...d, kind }))}
            placeholder="z. B. Gau, Horte, Konvent"
            hint="Optional."
          />
          <TextField
            id="group-order"
            label="Reihenfolge im PDF"
            numeric
            value={draft.order}
            onChange={(order) => setDraft((d) => ({ ...d, order }))}
            hint="Kleiner = weiter oben."
            error={orderErr}
          />
        </div>
        <div>
          <FormLabel htmlFor="group-parent">Übergeordnete Gliederung</FormLabel>
          <Combobox
            id="group-parent"
            options={parentOptions}
            value={draft.parentId != null ? String(draft.parentId) : PARENT_NONE}
            onChange={(v) =>
              setDraft((d) => {
                const parentId = v === PARENT_NONE ? null : Number(v);
                // Keep the inherited Bereich when the parent is cleared again.
                const inherited = groups.find((g) => g.id === parentId)?.section;
                return { ...d, parentId, section: inherited ?? d.section };
              })
            }
            searchPlaceholder="Gliederung suchen …"
          />
        </div>
        {parent ? (
          // A child always takes its parent's Bereich (saveGroup enforces it): say so
          // instead of showing a locked select.
          <div>
            <p className="eyebrow mb-1.5">Bereich</p>
            <p className="text-body text-ink">
              {SECTION_LABELS[parent.section]}
              <span className="text-caption text-ink-faint"> · von „{parent.name}“ übernommen</span>
            </p>
          </div>
        ) : (
          <div>
            <FormLabel htmlFor="group-section">Bereich</FormLabel>
            <Select
              value={draft.section}
              onValueChange={(v) => setDraft((d) => ({ ...d, section: v as Section }))}
            >
              <SelectTrigger
                id="group-section"
                className="w-full"
                aria-describedby={hasChildren ? "group-section-note" : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SECTION_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasChildren ? (
              <p id="group-section-note" className="mt-1 text-caption text-ink-faint">
                Gilt auch für alle Untergliederungen.
              </p>
            ) : null}
          </div>
        )}
      </EntryDialog>
    </>
  );
}
