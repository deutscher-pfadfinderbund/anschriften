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

import { EntryDialog, EntryField, EntryList, EntryRow, useEntryDialog } from "../_components/master-data-ui";

type Kind = "office" | "rank";

/** An Amt or Stand reduced to what the list and the dialog need. */
type Entry = { id: number; name: string; order: number };

type Draft = {
  kind: Kind;
  entry: Entry | null;
  name: string;
  order: string;
  /** The entries when the dialog opened: a just-created entry must not count as taken. */
  taken: Entry[];
};

/** Everything that differs between Ämter and Stände. */
const KINDS = {
  office: {
    tab: "Ämter",
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
    listDescription:
      "Die Zahl links ist die Reihenfolge im PDF: kleiner = weiter oben. Zum Bearbeiten auf ein Amt klicken.",
    empty: {
      icon: Briefcase,
      title: "Noch keine Ämter angelegt.",
      description:
        "Lege mit „Neues Amt“ das erste Amt an. Es steht danach bei Personen und als Verteiler-Regel zur Auswahl.",
    },
    /** An Amt may stay without Reihenfolge (stored as RANK_UNRANKED): it goes to the end. */
    optionalOrder: true,
    save: (id: number | null, name: string, order: number) => saveOffice(id, { name, rank: order }),
    remove: deleteOffice,
  },
  rank: {
    tab: "Stände",
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
    listDescription:
      "Die Zahl links ist die Reihenfolge in Auswahllisten: kleiner = weiter oben. Zum Bearbeiten auf einen Stand klicken.",
    empty: {
      icon: Award,
      title: "Noch keine Stände angelegt.",
      description:
        "Lege mit „Neuer Stand“ den ersten Stand an. Er steht danach bei Personen und als Verteiler-Regel zur Auswahl.",
    },
    optionalOrder: false,
    save: (id: number | null, name: string, order: number) => saveRank(id, { name, sortOrder: order }),
    remove: deleteRank,
  },
} as const;

/** The Reihenfolge as shown: null for an Amt without one. */
const shownOrder = (kind: Kind, order: number) =>
  KINDS[kind].optionalOrder && order === RANK_UNRANKED ? null : order;

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
  const dialog = useEntryDialog<Draft>({ kind: "office", entry: null, name: "", order: "", taken: [] });
  const { draft } = dialog;

  const entries: Record<Kind, Entry[]> = {
    office: offices.map((o) => ({ id: o.id, name: o.name, order: o.rank })),
    rank: ranks.map((r) => ({ id: r.id, name: r.name, order: r.sortOrder })),
  };
  const blockers = { office: officeBlockers, rank: rankBlockers }[draft.kind];
  const copy = KINDS[draft.kind];
  const nameTaken = isDuplicateName(draft.name, draft.taken, draft.entry?.id ?? null);
  const orderErr = orderError(draft.order, copy.optionalOrder);

  function openDialog(kind: Kind, entry: Entry | null) {
    const taken = entries[kind];
    const order = entry
      ? (shownOrder(kind, entry.order) ?? "")
      : nextOrder(taken.map((e) => shownOrder(kind, e.order)).filter((o) => o != null));
    dialog.show({ kind, entry, name: entry?.name ?? "", order: String(order), taken });
  }

  function submit() {
    const { kind, entry, name } = draft;
    const order = parseOrder(draft.order) ?? RANK_UNRANKED;
    dialog.run(() => KINDS[kind].save(entry?.id ?? null, name, order), entry ? KINDS[kind].saved : KINDS[kind].created);
  }

  function confirmDelete() {
    const { kind, entry } = draft;
    if (entry) dialog.run(() => KINDS[kind].remove(entry.id), KINDS[kind].deleted);
  }

  return (
    <>
      <PageHeader
        title="Ämter & Stände"
        subtitle="Auswahllisten für Personen und Verteiler · die Reihenfolge der Ämter bestimmt den PDF-Druck"
        actions={
          <Button onClick={() => openDialog(tab, null)}>
            <Plus aria-hidden />
            {KINDS[tab].create}
          </Button>
        }
      />
      <PageBody>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)} className="gap-gutter">
          <TabsList>
            {(["office", "rank"] as const).map((kind) => (
              <TabsTrigger key={kind} value={kind}>
                {KINDS[kind].tab} ({entries[kind].length})
              </TabsTrigger>
            ))}
          </TabsList>

          {(["office", "rank"] as const).map((kind) => (
            <TabsContent key={kind} value={kind}>
              <EntryList
                title={KINDS[kind].tab}
                description={KINDS[kind].listDescription}
                emptyState={entries[kind].length === 0 ? <EmptyState {...KINDS[kind].empty} /> : null}
              >
                {entries[kind].map((e) => {
                  const lists = kind === "office" ? (officeListRules[e.id] ?? []) : [];
                  return (
                    <EntryRow
                      key={e.id}
                      order={shownOrder(kind, e.order)}
                      orderLabel={KINDS[kind].orderLabel}
                      name={e.name}
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
                      onOpen={() => openDialog(kind, e)}
                    />
                  );
                })}
              </EntryList>
            </TabsContent>
          ))}
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
                description: `„${draft.entry.name}“ wird gelöscht. Das lässt sich nicht rückgängig machen.`,
                blockedReason: blockers[draft.entry.id],
                onConfirm: confirmDelete,
              }
            : undefined
        }
      >
        <EntryField
          id="entry-name"
          label="Name"
          value={draft.name}
          onValueChange={(name) => dialog.edit({ name })}
          error={nameTaken ? copy.duplicate : null}
        />
        <EntryField
          id="entry-order"
          label={copy.orderLabel}
          numeric
          value={draft.order}
          onValueChange={(order) => dialog.edit({ order })}
          placeholder={copy.optionalOrder ? "am Ende" : undefined}
          hint={copy.orderHint}
          error={orderErr}
        />
      </EntryDialog>
    </>
  );
}
