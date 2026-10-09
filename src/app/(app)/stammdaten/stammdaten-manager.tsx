"use client";

import { useState, useTransition } from "react";
import { Award, Briefcase, Plus } from "lucide-react";
import { toast } from "sonner";

import { deleteOffice, saveOffice } from "@/actions/offices";
import { deleteRank, saveRank } from "@/actions/ranks";
import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { Tag } from "@/components/tag";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ListRef, OfficeRow, RankRow } from "@/db/queries";
import { isDuplicateName, nextOrder, orderError, parseOrder } from "@/lib/master-data";
import { RANK_UNRANKED } from "@/lib/rank";

import { EntryDialog, EntryList, EntryRow, TextField } from "./_components/master-data-ui";

type Kind = "office" | "rank";

/** An Amt or Stand reduced to what the list and the dialog need. */
type Entry = { id: number; name: string; order: number };

type Draft = { kind: Kind; entry: Entry | null; name: string; order: string };

const COPY = {
  office: {
    create: "Neues Amt",
    edit: "Amt bearbeiten",
    created: "Amt angelegt.",
    saved: "Amt gespeichert.",
    deleted: "Amt gelöscht.",
    deleteTitle: "Amt löschen?",
    duplicate: "Ein Amt mit diesem Namen gibt es schon.",
    orderLabel: "Reihenfolge im PDF",
    orderHint: "Kleiner = weiter oben. Leer lassen: steht am Ende.",
    description: "Ämter stehen bei Personen und als Verteiler-Regel zur Auswahl.",
  },
  rank: {
    create: "Neuer Stand",
    edit: "Stand bearbeiten",
    created: "Stand angelegt.",
    saved: "Stand gespeichert.",
    deleted: "Stand gelöscht.",
    deleteTitle: "Stand löschen?",
    duplicate: "Ein Stand mit diesem Namen gibt es schon.",
    // The PDF does not order by Stand (it only prints a person's Stand after the name):
    // this number orders the pickers.
    orderLabel: "Reihenfolge in Auswahllisten",
    orderHint: "Kleiner = weiter oben.",
    description: "Stände stehen bei Personen und als Verteiler-Regel zur Auswahl.",
  },
} as const;

const officeEntry = (o: OfficeRow): Entry => ({ id: o.id, name: o.name, order: o.rank });
const rankEntry = (r: RankRow): Entry => ({ id: r.id, name: r.name, order: r.sortOrder });

export function StammdatenManager({
  offices,
  officeBlockers,
  officeListRules,
  ranks,
  rankBlockers,
}: {
  offices: OfficeRow[];
  /** Per office id: why it cannot be deleted (absent = deletable), same rule as the action. */
  officeBlockers: Record<number, string>;
  officeListRules: Record<number, ListRef[]>;
  ranks: RankRow[];
  /** Per rank id: why it cannot be deleted (absent = deletable), same rule as the action. */
  rankBlockers: Record<number, string>;
}) {
  const [isPending, startTransition] = useTransition();
  // Controlled so the header shows the create action of the visible tab.
  const [tab, setTab] = useState<Kind>("office");

  // `open` is kept apart from the draft so the dialog keeps its content while it fades out.
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({ kind: "office", entry: null, name: "", order: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The server's refusal, when a delete the page thought possible was refused after all.
  const [deleteRefusal, setDeleteRefusal] = useState<string | null>(null);

  const copy = COPY[draft.kind];
  const entries = draft.kind === "office" ? offices.map(officeEntry) : ranks.map(rankEntry);
  const nameTaken = isDuplicateName(draft.name, entries, draft.entry?.id ?? null);
  // An Amt may stay without Reihenfolge (the RANK_UNRANKED sentinel, shown as empty).
  const orderErr = orderError(draft.order, draft.kind === "office");
  const blockers = draft.kind === "office" ? officeBlockers : rankBlockers;

  function openDialog(kind: Kind, entry: Entry | null) {
    let order: string;
    if (entry) order = entry.order === RANK_UNRANKED && kind === "office" ? "" : String(entry.order);
    else
      order = String(
        nextOrder(
          kind === "office"
            ? offices.map((o) => o.rank).filter((r) => r !== RANK_UNRANKED)
            : ranks.map((r) => r.sortOrder),
        ),
      );
    setDraft({ kind, entry, name: entry?.name ?? "", order });
    setFormError(null);
    setConfirmOpen(false);
    setOpen(true);
  }

  function submit() {
    const { kind, entry, name } = draft;
    const order = parseOrder(draft.order) ?? RANK_UNRANKED;
    setFormError(null);
    startTransition(async () => {
      const res =
        kind === "office"
          ? await saveOffice(entry?.id ?? null, { name, rank: order })
          : await saveRank(entry?.id ?? null, { name, sortOrder: order });
      if (!res.ok) return setFormError(res.message);
      toast.success(entry ? COPY[kind].saved : COPY[kind].created);
      setOpen(false);
    });
  }

  function confirmDelete() {
    const { kind, entry } = draft;
    if (!entry) return;
    startTransition(async () => {
      const res = kind === "office" ? await deleteOffice(entry.id) : await deleteRank(entry.id);
      // Keep the confirmation open and let it say why (e.g. a Verteiler rule added meanwhile).
      if (!res.ok) return setDeleteRefusal(res.message);
      toast.success(COPY[kind].deleted);
      setOpen(false); // takes the confirmation with it
    });
  }

  return (
    <>
      <PageHeader
        title="Ämter & Stände"
        subtitle="Auswahllisten für Personen und Verteiler · die Reihenfolge der Ämter bestimmt den PDF-Druck"
        actions={
          <Button onClick={() => openDialog(tab, null)}>
            <Plus aria-hidden />
            {COPY[tab].create}
          </Button>
        }
      />
      <PageBody>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)} className="gap-gutter">
          <TabsList>
            <TabsTrigger value="office">Ämter ({offices.length})</TabsTrigger>
            <TabsTrigger value="rank">Stände ({ranks.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="office">
            <EntryList
              title="Reihenfolge im PDF"
              description="Kleiner = weiter oben. Zum Bearbeiten auf ein Amt klicken."
              emptyState={
                offices.length === 0 ? (
                  <EmptyState
                    icon={Briefcase}
                    title="Noch keine Ämter angelegt."
                    description="Lege über „Neues Amt“ oben rechts das erste Amt an. Es steht danach bei Personen und als Verteiler-Regel zur Auswahl."
                  />
                ) : null
              }
            >
              {offices.map((o) => (
                <EntryRow
                  key={o.id}
                  order={o.rank === RANK_UNRANKED ? "—" : o.rank}
                  orderTitle={
                    o.rank === RANK_UNRANKED ? "Ohne Reihenfolge – steht am Ende" : "Reihenfolge im PDF"
                  }
                  name={o.name}
                  meta={(officeListRules[o.id] ?? []).map((l) => (
                    <Tag
                      key={l.listId}
                      tone="brass"
                      title={`Wer dieses Amt hat, ist automatisch im Verteiler „${l.listName}“.`}
                    >
                      {l.listName}
                    </Tag>
                  ))}
                  onOpen={() => openDialog("office", officeEntry(o))}
                />
              ))}
            </EntryList>
          </TabsContent>

          <TabsContent value="rank">
            <EntryList
              title="Reihenfolge in Auswahllisten"
              description="Kleiner = weiter oben. Zum Bearbeiten auf einen Stand klicken."
              emptyState={
                ranks.length === 0 ? (
                  <EmptyState
                    icon={Award}
                    title="Noch keine Stände angelegt."
                    description="Lege über „Neuer Stand“ oben rechts den ersten Stand an. Er steht danach bei Personen und als Verteiler-Regel zur Auswahl."
                  />
                ) : null
              }
            >
              {ranks.map((r) => (
                <EntryRow
                  key={r.id}
                  order={r.sortOrder}
                  orderTitle="Reihenfolge in Auswahllisten"
                  name={r.name}
                  onOpen={() => openDialog("rank", rankEntry(r))}
                />
              ))}
            </EntryList>
          </TabsContent>
        </Tabs>
      </PageBody>

      <EntryDialog
        open={open}
        onOpenChange={setOpen}
        title={draft.entry ? copy.edit : copy.create}
        description={copy.description}
        canSave={draft.name.trim() !== "" && !nameTaken && orderErr == null}
        pending={isPending}
        error={formError}
        onSubmit={submit}
        deletion={
          draft.entry
            ? {
                title: copy.deleteTitle,
                description: `„${draft.entry.name}“ wird gelöscht. Das kann nicht rückgängig gemacht werden.`,
                blockedMessage: deleteRefusal ?? blockers[draft.entry.id],
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
          id="entry-name"
          label="Name"
          value={draft.name}
          onChange={(name) => setDraft((d) => ({ ...d, name }))}
          error={nameTaken ? copy.duplicate : null}
        />
        <TextField
          id="entry-order"
          label={copy.orderLabel}
          numeric
          value={draft.order}
          onChange={(order) => setDraft((d) => ({ ...d, order }))}
          placeholder={draft.kind === "office" ? "am Ende" : undefined}
          hint={copy.orderHint}
          error={orderErr}
        />
      </EntryDialog>
    </>
  );
}
