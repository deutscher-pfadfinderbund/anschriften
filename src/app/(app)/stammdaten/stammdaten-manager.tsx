"use client";

import { useState } from "react";
import { Award, Briefcase, Plus } from "lucide-react";

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

import { EntryDialog, EntryList, EntryRow, TextField, useEntryDialog } from "../_components/master-data-ui";

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
  // Controlled so the header shows the create action of the visible tab.
  const [tab, setTab] = useState<Kind>("office");
  const dialog = useEntryDialog<Draft>({ kind: "office", entry: null, name: "", order: "" });
  const { draft } = dialog;

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
    dialog.show({ kind, entry, name: entry?.name ?? "", order });
  }

  function submit() {
    const { kind, entry, name } = draft;
    const order = parseOrder(draft.order) ?? RANK_UNRANKED;
    dialog.run(
      () =>
        kind === "office"
          ? saveOffice(entry?.id ?? null, { name, rank: order })
          : saveRank(entry?.id ?? null, { name, sortOrder: order }),
      entry ? COPY[kind].saved : COPY[kind].created,
    );
  }

  function confirmDelete() {
    const { kind, entry } = draft;
    if (!entry) return;
    dialog.run(
      () => (kind === "office" ? deleteOffice(entry.id) : deleteRank(entry.id)),
      COPY[kind].deleted,
    );
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
              title="Ämter"
              description="Die Zahl links ist die Reihenfolge im PDF: kleiner = weiter oben. Zum Bearbeiten auf ein Amt klicken."
              emptyState={
                offices.length === 0 ? (
                  <EmptyState
                    icon={Briefcase}
                    title="Noch keine Ämter angelegt."
                    description="Lege mit „Neues Amt“ das erste Amt an. Es steht danach bei Personen und als Verteiler-Regel zur Auswahl."
                  />
                ) : null
              }
            >
              {offices.map((o) => {
                const lists = officeListRules[o.id] ?? [];
                return (
                  <EntryRow
                    key={o.id}
                    order={o.rank === RANK_UNRANKED ? null : o.rank}
                    orderLabel={COPY.office.orderLabel}
                    name={o.name}
                    meta={
                      lists.length > 0 ? (
                        <>
                          <span className="sr-only">Verteiler: </span>
                          {lists.map((l) => (
                            <Tag
                              key={l.listId}
                              tone="brass"
                              title={`Wer dieses Amt hat, ist automatisch im Verteiler „${l.listName}“.`}
                            >
                              {l.listName}
                            </Tag>
                          ))}
                        </>
                      ) : null
                    }
                    onOpen={() => openDialog("office", officeEntry(o))}
                  />
                );
              })}
            </EntryList>
          </TabsContent>

          <TabsContent value="rank">
            <EntryList
              title="Stände"
              description="Die Zahl links ist die Reihenfolge in Auswahllisten: kleiner = weiter oben. Zum Bearbeiten auf einen Stand klicken."
              emptyState={
                ranks.length === 0 ? (
                  <EmptyState
                    icon={Award}
                    title="Noch keine Stände angelegt."
                    description="Lege mit „Neuer Stand“ den ersten Stand an. Er steht danach bei Personen und als Verteiler-Regel zur Auswahl."
                  />
                ) : null
              }
            >
              {ranks.map((r) => (
                <EntryRow
                  key={r.id}
                  order={r.sortOrder}
                  orderLabel={COPY.rank.orderLabel}
                  name={r.name}
                  onOpen={() => openDialog("rank", rankEntry(r))}
                />
              ))}
            </EntryList>
          </TabsContent>
        </Tabs>
      </PageBody>

      <EntryDialog
        state={dialog}
        title={draft.entry ? copy.edit : copy.create}
        description={copy.description}
        canSave={draft.name.trim() !== "" && !nameTaken && orderErr == null}
        onSubmit={submit}
        deletion={
          draft.entry
            ? {
                title: copy.deleteTitle,
                description: `„${draft.entry.name}“ wird gelöscht. Das kann nicht rückgängig gemacht werden.`,
                blockedReason: blockers[draft.entry.id],
                onConfirm: confirmDelete,
              }
            : undefined
        }
      >
        <TextField
          id="entry-name"
          label="Name"
          value={draft.name}
          onChange={(name) => dialog.edit({ name })}
          error={nameTaken ? copy.duplicate : null}
        />
        <TextField
          id="entry-order"
          label={copy.orderLabel}
          numeric
          value={draft.order}
          onChange={(order) => dialog.edit({ order })}
          placeholder={draft.kind === "office" ? "am Ende" : undefined}
          hint={copy.orderHint}
          error={orderErr}
        />
      </EntryDialog>
    </>
  );
}
