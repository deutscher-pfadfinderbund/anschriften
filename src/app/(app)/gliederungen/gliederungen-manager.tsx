"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createGroup, deleteGroup, updateGroup } from "@/actions/groups";
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
import { SECTION_LABELS, SECTION_ORDER } from "@/lib/format";
import { orderGroups } from "@/lib/groups";

export type GroupUsage = Record<number, { assignments: number; children: number }>;

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

/** Ids of a group's descendants (client-side, from the full list) — invalid parents. */
function descendantIds(groups: GroupRow[], id: number): Set<number> {
  const children = new Map<number, number[]>();
  for (const g of groups) {
    if (g.parentId == null) continue;
    if (!children.has(g.parentId)) children.set(g.parentId, []);
    children.get(g.parentId)!.push(g.id);
  }
  const out = new Set<number>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    out.add(cur);
    for (const c of children.get(cur) ?? []) stack.push(c);
  }
  return out;
}

export function GliederungenManager({
  groups,
  usage,
}: {
  groups: GroupRow[];
  usage: GroupUsage;
}) {
  const router = useRouter();
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
      section: form.section as (typeof SECTION_ORDER)[number],
      kind: form.kind.trim() ? form.kind.trim() : null,
      sortKey: Number(form.sortKey) || 0,
      parentId: form.parentId,
    };
    startTransition(async () => {
      const res = form.id != null ? await updateGroup(form.id, payload) : await createGroup(payload);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(form.id != null ? "Gliederung gespeichert." : "Gliederung angelegt.");
      setFormOpen(false);
      router.refresh();
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
      router.refresh();
    });
  }

  const targetUsage = deleteTarget ? usage[deleteTarget.id] : undefined;
  const targetBlocked =
    !!targetUsage && (targetUsage.assignments > 0 || targetUsage.children > 0);

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
                <li
                  key={group.id}
                  className="group/row flex items-center gap-2 px-[18px] py-1.5 text-[13.5px] hover:bg-sel"
                  style={{ paddingLeft: `${18 + depth * 16}px` }}
                >
                  <MonoBadge>{group.sortKey}</MonoBadge>
                  <span className="text-ink">{group.name}</span>
                  <span className="ml-auto flex items-center gap-2 text-[11px] uppercase tracking-[0.06em] text-ink-faint">
                    {group.kind ? <span>{group.kind}</span> : null}
                    <span>{SECTION_LABELS[group.section] ?? group.section}</span>
                  </span>
                  <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                    <Button variant="ghost" size="icon-sm" aria-label="Bearbeiten" onClick={() => openEdit(group)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Löschen"
                      className="text-ink-faint hover:text-crit"
                      onClick={() => setDeleteTarget(group)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </span>
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
                <Select value={form.section} onValueChange={(v) => setForm((f) => ({ ...f, section: v }))}>
                  <SelectTrigger id="g-section" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTION_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SECTION_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                onChange={(v) => setForm((f) => ({ ...f, parentId: v === PARENT_NONE ? null : Number(v) }))}
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
        blockedMessage={
          targetBlocked
            ? "Diese Gliederung kann nicht gelöscht werden, solange ihr Untergliederungen oder Personen zugeordnet sind."
            : undefined
        }
        pending={isPending}
        onConfirm={confirmDelete}
      />
    </>
  );
}
