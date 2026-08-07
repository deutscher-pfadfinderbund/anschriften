"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Award, Briefcase, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createOffice, deleteOffice, updateOffice } from "@/actions/offices";
import { createRank, deleteRank, updateRank } from "@/actions/ranks";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OfficeListRule, OfficeRow, RankRow } from "@/db/queries";
import { RANK_UNRANKED } from "@/lib/rank";

/** Rank input value for the form: the sentinel is shown as an empty field. */
function rankToInput(rank: number): string {
  return rank === RANK_UNRANKED ? "" : String(rank);
}

/** …and back: an empty field means "ohne Rang", i.e. the sentinel — never 0. */
function inputToRank(value: string): number {
  const trimmed = value.trim();
  return trimmed === "" ? RANK_UNRANKED : Number(trimmed) || 0;
}

type OfficeForm = { id: number | null; name: string; rank: string };
type RankForm = { id: number | null; name: string; sortOrder: string };
type DeleteTarget = {
  type: "office" | "rank";
  id: number;
  name: string;
  blocked: boolean;
  blockedMessage?: string;
};

function LabeledInput({
  id,
  label,
  value,
  onChange,
  type = "text",
  numeric = false,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  numeric?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <FormLabel htmlFor={id}>{label}</FormLabel>
      <Input
        id={id}
        type={type}
        min={type === "number" ? 0 : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={numeric ? "tabular-nums" : undefined}
      />
    </div>
  );
}

export function StammdatenManager({
  offices,
  officeUsage,
  officeListRules,
  ranks,
  rankUsage,
}: {
  offices: OfficeRow[];
  officeUsage: Record<number, number>;
  officeListRules: Record<number, OfficeListRule[]>;
  ranks: RankRow[];
  rankUsage: Record<number, number>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Controlled so the header row can show the action for the visible tab.
  const [tab, setTab] = useState<"offices" | "ranks">("offices");
  const [officeForm, setOfficeForm] = useState<OfficeForm | null>(null);
  const [rankForm, setRankForm] = useState<RankForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  function submitOffice() {
    if (!officeForm) return;
    const payload = { name: officeForm.name, rank: inputToRank(officeForm.rank) };
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
        <Tabs value={tab} onValueChange={(v) => setTab(v as "offices" | "ranks")}>
          {/* One clean header row: tabs left, the action for the visible tab right. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="offices">Ämter ({offices.length})</TabsTrigger>
              <TabsTrigger value="ranks">Stände ({ranks.length})</TabsTrigger>
            </TabsList>
            {tab === "offices" ? (
              <Button onClick={() => setOfficeForm({ id: null, name: "", rank: "" })}>
                <Plus className="size-4" />
                Neues Amt
              </Button>
            ) : (
              <Button onClick={() => setRankForm({ id: null, name: "", sortOrder: "0" })}>
                <Plus className="size-4" />
                Neuer Stand
              </Button>
            )}
          </div>

          {/* Ämter */}
          <TabsContent value="offices">
            <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
              {offices.length === 0 ? (
                <EmptyState
                  icon={Briefcase}
                  title="Noch keine Ämter angelegt."
                  description="Lege über „Neues Amt“ das erste Amt an — Ämter stehen danach im Anschriften-Editor und als Verteiler-Regel zur Auswahl."
                />
              ) : (
              <ul>
                {offices.map((o) => (
                  <li
                    key={o.id}
                    className="group/row border-b border-line last:border-b-0 hover:bg-sel"
                  >
                    {/* max-w keeps name and actions in one readable band instead of
                        stretching across the whole viewport. */}
                    <div className="flex max-w-3xl items-center gap-2.5 px-[18px] py-1.5 text-[13.5px]">
                      {/* RANK_UNRANKED is an internal sentinel — never show the raw 999. */}
                      <MonoBadge title={o.rank === RANK_UNRANKED ? "ohne Rang" : undefined}>
                        {o.rank === RANK_UNRANKED ? "—" : o.rank}
                      </MonoBadge>
                      <span className="truncate text-ink">{o.name}</span>
                      {(officeListRules[o.id] ?? []).length > 0 ? (
                        <span
                          className="flex flex-wrap items-center gap-1"
                          title="Inhaber dieses Amts sind automatisch in diesen Verteilern."
                        >
                          {officeListRules[o.id].map((r) => (
                            <span
                              key={r.listId}
                              className="rounded-[4px] border border-brass/40 bg-brass-tint px-1.5 py-px text-[10.5px] text-ink-soft"
                            >
                              {r.listName}
                            </span>
                          ))}
                        </span>
                      ) : null}
                      {/* Always visible on touch (no :hover, and tapping a plain row
                          focuses nothing) — hover-reveal only from sm: up. */}
                      <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Bearbeiten"
                          onClick={() =>
                            setOfficeForm({ id: o.id, name: o.name, rank: rankToInput(o.rank) })
                          }
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Löschen"
                          className="text-ink-faint hover:text-crit"
                          onClick={() => {
                            const usedByPersons = (officeUsage[o.id] ?? 0) > 0;
                            const rules = officeListRules[o.id] ?? [];
                            const blocked = usedByPersons || rules.length > 0;
                            setDeleteTarget({
                              type: "office",
                              id: o.id,
                              name: o.name,
                              blocked,
                              // A rule-only usage would otherwise show an enabled button
                              // that the server then refuses — explain it up front.
                              blockedMessage: !blocked
                                ? undefined
                                : usedByPersons
                                  ? "Dieses Amt ist noch Personen zugeordnet und kann nicht gelöscht werden."
                                  : `Dieses Amt wird noch als Verteiler-Regel verwendet (${rules
                                      .map((r) => r.listName)
                                      .join(", ")}) und kann nicht gelöscht werden. Bitte zuerst die Regel im Verteiler entfernen.`,
                            });
                          }}
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
          </TabsContent>

          {/* Stände */}
          <TabsContent value="ranks">
            <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
              {ranks.length === 0 ? (
                <EmptyState
                  icon={Award}
                  title="Noch keine Stände angelegt."
                  description="Lege über „Neuer Stand“ den ersten Stand an — Stände stehen danach im Anschriften-Editor und als Verteiler-Regel zur Auswahl."
                />
              ) : (
              <ul>
                {ranks.map((r) => (
                  <li
                    key={r.id}
                    className="group/row border-b border-line last:border-b-0 hover:bg-sel"
                  >
                    <div className="flex max-w-3xl items-center gap-2.5 px-[18px] py-1.5 text-[13.5px]">
                      <MonoBadge>{r.sortOrder}</MonoBadge>
                      <span className="truncate text-ink">{r.name}</span>
                      {/* Always visible on touch (no :hover, and tapping a plain row
                          focuses nothing) — hover-reveal only from sm: up. */}
                      <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Bearbeiten"
                          onClick={() =>
                            setRankForm({ id: r.id, name: r.name, sortOrder: String(r.sortOrder) })
                          }
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
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
                    </div>
                  </li>
                ))}
              </ul>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Office dialog */}
      <Dialog open={officeForm != null} onOpenChange={(o) => !o && setOfficeForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{officeForm?.id != null ? "Amt bearbeiten" : "Neues Amt"}</DialogTitle>
            <DialogDescription>
              Der Rang steuert die Reihenfolge der Ämter im PDF (kleiner = weiter oben). Leer
              lassen für „ohne Rang“ — diese Ämter stehen am Ende.
            </DialogDescription>
          </DialogHeader>
          {officeForm ? (
            <div className="flex flex-col gap-3">
              <LabeledInput id="o-name" label="Name" value={officeForm.name} onChange={(v) => setOfficeForm({ ...officeForm, name: v })} />
              <LabeledInput
                id="o-rank"
                label="Rang"
                type="number"
                numeric
                placeholder="ohne Rang"
                value={officeForm.rank}
                onChange={(v) => setOfficeForm({ ...officeForm, rank: v })}
              />
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
      <ConfirmDeleteDialog
        open={deleteTarget != null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={deleteTarget?.type === "office" ? "Amt löschen?" : "Stand löschen?"}
        description={`„${deleteTarget?.name}“ wird gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
        blockedMessage={
          deleteTarget?.blocked
            ? deleteTarget.blockedMessage ??
              "Dieser Eintrag ist noch Personen zugeordnet und kann nicht gelöscht werden."
            : undefined
        }
        pending={isPending}
        onConfirm={confirmDelete}
      />
    </>
  );
}
