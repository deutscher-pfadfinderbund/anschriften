"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createOffice, deleteOffice, updateOffice } from "@/actions/offices";
import { createRank, deleteRank, updateRank } from "@/actions/ranks";
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
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OfficeRow, RankRow } from "@/db/queries";

type OfficeForm = { id: number | null; name: string; rank: string };
type RankForm = { id: number | null; name: string; sortOrder: string };
type DeleteTarget = { type: "office" | "rank"; id: number; name: string; blocked: boolean };

function LabeledInput({
  id,
  label,
  value,
  onChange,
  type = "text",
  numeric = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  numeric?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-faint">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        min={type === "number" ? 0 : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={numeric ? "tabular-nums" : undefined}
      />
    </div>
  );
}

function MonoBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="min-w-8 rounded-[3px] border border-line bg-surface-2 px-1.5 py-px text-right font-mono text-[11px] tabular-nums text-ink-faint">
      {children}
    </span>
  );
}

export function StammdatenManager({
  offices,
  officeUsage,
  ranks,
  rankUsage,
}: {
  offices: OfficeRow[];
  officeUsage: Record<number, number>;
  ranks: RankRow[];
  rankUsage: Record<number, number>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [officeForm, setOfficeForm] = useState<OfficeForm | null>(null);
  const [rankForm, setRankForm] = useState<RankForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  function submitOffice() {
    if (!officeForm) return;
    const payload = { name: officeForm.name, rank: Number(officeForm.rank) || 0 };
    startTransition(async () => {
      const res = officeForm.id != null ? await updateOffice(officeForm.id, payload) : await createOffice(payload);
      if (!res.ok) return void toast.error(res.message);
      toast.success(officeForm.id != null ? "Amt gespeichert." : "Amt angelegt.");
      setOfficeForm(null);
      router.refresh();
    });
  }

  function submitRank() {
    if (!rankForm) return;
    const payload = { name: rankForm.name, sortOrder: Number(rankForm.sortOrder) || 0 };
    startTransition(async () => {
      const res = rankForm.id != null ? await updateRank(rankForm.id, payload) : await createRank(payload);
      if (!res.ok) return void toast.error(res.message);
      toast.success(rankForm.id != null ? "Stand gespeichert." : "Stand angelegt.");
      setRankForm(null);
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res =
        deleteTarget.type === "office"
          ? await deleteOffice(deleteTarget.id)
          : await deleteRank(deleteTarget.id);
      if (!res.ok) {
        toast.error(res.message);
        setDeleteTarget(null);
        return;
      }
      toast.success(deleteTarget.type === "office" ? "Amt gelöscht." : "Stand gelöscht.");
      setDeleteTarget(null);
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader
        title="Ämter & Stände"
        subtitle="Lookup-Listen für den Editor · Rang und Sortierung steuern die Reihenfolge im PDF"
      />
      <div className="px-6 pt-[18px] pb-10">
        <Tabs defaultValue="offices">
          <TabsList className="mb-4">
            <TabsTrigger value="offices">Ämter ({offices.length})</TabsTrigger>
            <TabsTrigger value="ranks">Stände ({ranks.length})</TabsTrigger>
          </TabsList>

          {/* Ämter */}
          <TabsContent value="offices">
            <div className="mb-3 flex justify-end">
              <Button onClick={() => setOfficeForm({ id: null, name: "", rank: "999" })}>
                <Plus className="size-4" />
                Neues Amt
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
              <ul>
                {offices.map((o) => (
                  <li
                    key={o.id}
                    className="group/row flex items-center gap-2.5 border-b border-line px-[18px] py-2 text-[13.5px] last:border-b-0 hover:bg-sel"
                  >
                    <MonoBadge>{o.rank}</MonoBadge>
                    <span className="text-ink">{o.name}</span>
                    <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Bearbeiten"
                        onClick={() => setOfficeForm({ id: o.id, name: o.name, rank: String(o.rank) })}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Löschen"
                        className="text-ink-faint hover:text-crit"
                        onClick={() =>
                          setDeleteTarget({
                            type: "office",
                            id: o.id,
                            name: o.name,
                            blocked: (officeUsage[o.id] ?? 0) > 0,
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>

          {/* Stände */}
          <TabsContent value="ranks">
            <div className="mb-3 flex justify-end">
              <Button onClick={() => setRankForm({ id: null, name: "", sortOrder: "0" })}>
                <Plus className="size-4" />
                Neuer Stand
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
              <ul>
                {ranks.map((r) => (
                  <li
                    key={r.id}
                    className="group/row flex items-center gap-2.5 border-b border-line px-[18px] py-2 text-[13.5px] last:border-b-0 hover:bg-sel"
                  >
                    <MonoBadge>{r.sortOrder}</MonoBadge>
                    <span className="text-ink">{r.name}</span>
                    <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Bearbeiten"
                        onClick={() => setRankForm({ id: r.id, name: r.name, sortOrder: String(r.sortOrder) })}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Löschen"
                        className="text-ink-faint hover:text-crit"
                        onClick={() =>
                          setDeleteTarget({
                            type: "rank",
                            id: r.id,
                            name: r.name,
                            blocked: (rankUsage[r.id] ?? 0) > 0,
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Office dialog */}
      <Dialog open={officeForm != null} onOpenChange={(o) => !o && setOfficeForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{officeForm?.id != null ? "Amt bearbeiten" : "Neues Amt"}</DialogTitle>
            <DialogDescription>Der Rang steuert die Reihenfolge der Ämter im PDF (kleiner = weiter oben).</DialogDescription>
          </DialogHeader>
          {officeForm ? (
            <div className="flex flex-col gap-3">
              <LabeledInput id="o-name" label="Name" value={officeForm.name} onChange={(v) => setOfficeForm({ ...officeForm, name: v })} />
              <LabeledInput id="o-rank" label="Rang" type="number" numeric value={officeForm.rank} onChange={(v) => setOfficeForm({ ...officeForm, rank: v })} />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfficeForm(null)} disabled={isPending}>
              Abbrechen
            </Button>
            <Button onClick={submitOffice} disabled={isPending}>
              {isPending ? "Speichern …" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rank dialog */}
      <Dialog open={rankForm != null} onOpenChange={(o) => !o && setRankForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rankForm?.id != null ? "Stand bearbeiten" : "Neuer Stand"}</DialogTitle>
            <DialogDescription>Die Sortierung steuert die Reihenfolge der Stände.</DialogDescription>
          </DialogHeader>
          {rankForm ? (
            <div className="flex flex-col gap-3">
              <LabeledInput id="r-name" label="Name" value={rankForm.name} onChange={(v) => setRankForm({ ...rankForm, name: v })} />
              <LabeledInput id="r-sort" label="Sortierung" type="number" numeric value={rankForm.sortOrder} onChange={(v) => setRankForm({ ...rankForm, sortOrder: v })} />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRankForm(null)} disabled={isPending}>
              Abbrechen
            </Button>
            <Button onClick={submitRank} disabled={isPending}>
              {isPending ? "Speichern …" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deleteTarget?.type === "office" ? "Amt löschen?" : "Stand löschen?"}</DialogTitle>
            <DialogDescription>
              {deleteTarget?.blocked
                ? "Dieser Eintrag ist noch Personen zugeordnet und kann nicht gelöscht werden."
                : `„${deleteTarget?.name}“ wird gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isPending}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isPending || deleteTarget?.blocked}>
              {isPending ? "Löschen …" : "Löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
