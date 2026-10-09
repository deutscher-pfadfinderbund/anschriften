"use client";

import { useMemo, useState, useTransition } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteGroup, saveGroup } from "@/actions/groups";
import { Combobox, type ComboOption } from "@/components/combobox";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { EmptyState } from "@/components/empty-state";
import { FormLabel } from "@/components/form-label";
import { MonoBadge } from "@/components/mono-badge";
import { PageHeader } from "@/components/page-header";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GroupRow } from "@/db/queries";
import { SECTIONS, SECTION_LABELS, type Section } from "@/lib/sections";
import { descendantIds, orderGroups } from "@/lib/groups";
import { HOVER_REVEAL, cn } from "@/lib/utils";

const PARENT_NONE = "none";

type FormState = {
  id: number | null;
  name: string;
  section: string;
  kind: string;
  sortKey: string;
  parentId: number | null;
};

function emptyForm(): FormState {
  return { id: null, name: "", section: "bund", kind: "", sortKey: "0", parentId: null };
}

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

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<GroupRow | null>(null);

  const parentOptions: ComboOption[] = useMemo(() => {
    const forbidden = form.id != null ? descendantIds(groups, form.id) : new Set<number>();
    if (form.id != null) forbidden.add(form.id);
    return [
      { value: PARENT_NONE, label: "— keine (oberste Ebene) —" },
      ...orderGroups(groups)
        .filter(({ group }) => !forbidden.has(group.id))
        .map(({ group, depth }) => ({ value: String(group.id), label: group.name, depth })),
    ];
  }, [groups, form.id]);

  // A child always takes its parent's Bereich (saveGroup enforces it), so the select shows
  // the parent's and is locked. A top-level group's Bereich carries its whole subtree along.
  const parent = form.parentId != null ? groups.find((g) => g.id === form.parentId) : undefined;
  const shownSection = parent?.section ?? form.section;
  const hasChildren = form.id != null && groups.some((g) => g.parentId === form.id);
  const sectionHint =
    parent != null
      ? "Wird von der übergeordneten Gliederung übernommen."
      : hasChildren
        ? "Gilt auch für alle Untergliederungen."
        : null;

  function openCreate() {
    setForm(emptyForm());
    setFormOpen(true);
  }
  function openEdit(g: GroupRow) {
    setForm({
      id: g.id,
      name: g.name,
      section: g.section,
      kind: g.kind ?? "",
      sortKey: String(g.sortKey),
      parentId: g.parentId,
    });
    setFormOpen(true);
  }

  function submitForm() {
    const payload = {
      name: form.name,
      section: shownSection as Section,
      kind: form.kind.trim() ? form.kind.trim() : null,
      sortKey: Number(form.sortKey) || 0,
      parentId: form.parentId,
    };
    startTransition(async () => {
      const res = await saveGroup(form.id, payload);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(form.id != null ? "Gliederung gespeichert." : "Gliederung angelegt.");
      setFormOpen(false);
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res = await deleteGroup(deleteTarget.id);
      if (!res.ok) {
        toast.error(res.message);
        setDeleteTarget(null);
        return;
      }
      toast.success("Gliederung gelöscht.");
      setDeleteTarget(null);
    });
  }

  return (
    <>
      <PageHeader
        title="Gliederungen"
        subtitle="Quelle aller Gliederungs-Dropdowns · Sortierschlüssel steuert die Reihenfolge im PDF"
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Neu
          </Button>
        }
      />
      <div className="px-6 pt-[18px] pb-10">
        <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
          {ordered.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Noch keine Gliederungen angelegt."
              description="Lege über „Neu“ die erste Gliederung an — sie steht danach in allen Gliederungs-Auswahlfeldern zur Verfügung."
            />
          ) : (
            <ul className="py-1.5">
              {ordered.map(({ group, depth }) => (
                <li key={group.id} className="group/row hover:bg-sel">
                  {/* max-w keeps name and labels in one readable band instead of
                      stretching them to opposite ends of a wide viewport. Below `sm`
                      the row wraps and Art/Bereich move to a second line, so the
                      Gliederungs-Name is readable in full instead of „Gau F…“. */}
                  <div
                    className="flex max-w-3xl flex-wrap items-center gap-2 px-[18px] py-1.5 text-[13.5px] sm:flex-nowrap"
                    style={{ paddingLeft: `${18 + depth * 16}px` }}
                  >
                    <MonoBadge>{group.sortKey}</MonoBadge>
                    {/* flex-1 below sm (fills the line and wraps the text),
                        the original shrink-and-truncate from sm: up. */}
                    <span className="min-w-0 flex-1 text-ink sm:flex-initial sm:truncate">{group.name}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] text-ink-faint max-sm:order-last max-sm:w-full">
                      {group.kind ? (
                        <>
                          <span>{group.kind}</span>
                          <span aria-hidden className="text-line-strong">
                            ·
                          </span>
                        </>
                      ) : null}
                      <span>{SECTION_LABELS[group.section]}</span>
                    </span>
                    <span className={cn("flex shrink-0 items-center gap-0.5", HOVER_REVEAL)}>
                      <Button variant="ghost" size="icon-xs" aria-label="Bearbeiten" onClick={() => openEdit(group)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Löschen"
                        className="text-ink-faint hover:text-crit"
                        onClick={() => setDeleteTarget(group)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Create / edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id != null ? "Gliederung bearbeiten" : "Neue Gliederung"}</DialogTitle>
            <DialogDescription>Name, Ebene und Sortierschlüssel der Gliederung.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <FormLabel htmlFor="g-name">Name</FormLabel>
              <Input id="g-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel htmlFor="g-section">Bereich</FormLabel>
                <Select
                  value={shownSection}
                  onValueChange={(v) => setForm((f) => ({ ...f, section: v }))}
                  disabled={parent != null}
                >
                  <SelectTrigger
                    id="g-section"
                    className="w-full"
                    aria-describedby={sectionHint ? "g-section-hint" : undefined}
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
                {sectionHint ? (
                  <p id="g-section-hint" className="mt-1 text-xs text-ink-faint">
                    {sectionHint}
                  </p>
                ) : null}
              </div>
              <div>
                <FormLabel htmlFor="g-sort">Sortierschlüssel</FormLabel>
                <Input
                  id="g-sort"
                  type="number"
                  min={0}
                  value={form.sortKey}
                  onChange={(e) => setForm((f) => ({ ...f, sortKey: e.target.value }))}
                  className="tabular-nums"
                />
              </div>
            </div>
            <div>
              <FormLabel htmlFor="g-kind">Art (Gau, Stamm, Konvent …)</FormLabel>
              <Input id="g-kind" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))} placeholder="optional" />
            </div>
            <div>
              <FormLabel>Übergeordnete Gliederung</FormLabel>
              <Combobox
                options={parentOptions}
                value={form.parentId != null ? String(form.parentId) : PARENT_NONE}
                onChange={(v) =>
                  setForm((f) => {
                    const parentId = v === PARENT_NONE ? null : Number(v);
                    // Keep the inherited Bereich when the parent is cleared again.
                    const inherited = groups.find((g) => g.id === parentId)?.section;
                    return { ...f, parentId, section: inherited ?? f.section };
                  })
                }
                placeholder="— keine (oberste Ebene) —"
                searchPlaceholder="Gliederung suchen …"
                aria-label="Übergeordnete Gliederung"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={isPending}>
              Abbrechen
            </Button>
            <Button onClick={submitForm} disabled={isPending}>
              {isPending ? "Speichern …" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <ConfirmDeleteDialog
        open={deleteTarget != null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Gliederung löschen?"
        description={`„${deleteTarget?.name}“ wird gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
        blockedMessage={deleteTarget ? blockers[deleteTarget.id] : undefined}
        pending={isPending}
        onConfirm={confirmDelete}
      />
    </>
  );
}
