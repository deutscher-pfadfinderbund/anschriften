"use client";

import { useMemo } from "react";
import { Building2, Plus } from "lucide-react";

import { deleteGroup, saveGroup } from "@/actions/groups";
import {
  EntryDialog,
  EntryList,
  EntryRow,
  TextField,
  useEntryDialog,
} from "@/app/(app)/stammdaten/_components/master-data-ui";
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
  const ordered = useMemo(() => orderGroups(groups), [groups]);
  const dialog = useEntryDialog<Draft>({
    group: null,
    name: "",
    kind: "",
    order: "",
    parentId: null,
    section: "bund",
  });
  const { draft } = dialog;

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
    dialog.show(
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
    dialog.run(
      () => saveGroup(group?.id ?? null, payload),
      group ? "Gliederung gespeichert." : "Gliederung angelegt.",
    );
  }

  function confirmDelete() {
    const { group } = draft;
    if (!group) return;
    dialog.run(() => deleteGroup(group.id), "Gliederung gelöscht.");
  }

  return (
    <>
      <PageHeader
        title="Gliederungen"
        subtitle="Grundlage für Personen, Verteiler und den PDF-Druck"
        actions={
          <Button onClick={() => openDialog(null)}>
            <Plus aria-hidden />
            Neue Gliederung
          </Button>
        }
      />
      <PageBody>
        <EntryList
          title="Aufbau des Bundes"
          description="Die Zahl links ist die Reihenfolge im PDF: kleiner = weiter oben. Untergliederungen sind eingerückt. Zum Bearbeiten auf eine Gliederung klicken."
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
              orderLabel="Reihenfolge im PDF"
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
        state={dialog}
        title={draft.group ? "Gliederung bearbeiten" : "Neue Gliederung"}
        description="Gliederungen stehen bei Personen, Verteilern und im PDF zur Auswahl."
        className="sm:max-w-md"
        canSave={draft.name.trim() !== "" && !nameTaken && orderErr == null}
        onSubmit={submit}
        deletion={
          draft.group
            ? {
                title: "Gliederung löschen?",
                description: `„${draft.group.name}“ wird gelöscht. Das kann nicht rückgängig gemacht werden.`,
                blockedReason: blockers[draft.group.id],
                onConfirm: confirmDelete,
              }
            : undefined
        }
      >
        <TextField
          id="group-name"
          label="Name"
          value={draft.name}
          onChange={(name) => dialog.edit({ name })}
          error={nameTaken ? "Eine Gliederung mit diesem Namen gibt es schon." : null}
        />
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <TextField
            id="group-kind"
            label="Art"
            value={draft.kind}
            onChange={(kind) => dialog.edit({ kind })}
            placeholder="z. B. Gau, Horte, Konvent"
            hint="Optional."
          />
          <TextField
            id="group-order"
            label="Reihenfolge im PDF"
            numeric
            value={draft.order}
            onChange={(order) => dialog.edit({ order })}
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
            onChange={(v) => {
              const parentId = v === PARENT_NONE ? null : Number(v);
              // Keep the inherited Bereich when the parent is cleared again.
              const inherited = groups.find((g) => g.id === parentId)?.section;
              dialog.edit({ parentId, section: inherited ?? draft.section });
            }}
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
              onValueChange={(v) => dialog.edit({ section: v as Section })}
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
