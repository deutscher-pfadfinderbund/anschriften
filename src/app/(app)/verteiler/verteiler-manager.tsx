"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, Plus } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type {
  DistributionListWithMembers,
  GroupRow,
  MailLogEntry,
  OfficeRow,
  PersonOption,
  RankRow,
} from "@/db/queries";

import { ListDetail } from "./list-detail";
import { ListFormDialog, type ListDraft } from "./list-form-dialog";
import { ListNav } from "./list-nav";

const NEW_LIST: ListDraft = { id: null, name: "", description: "" };

/**
 * The /verteiler screen: list navigation on the left (a select on phones), the chosen
 * list on the right. The selection lives in the URL (`?list=<id>`), so a reload or a
 * shared link opens the same list.
 */
export function VerteilerManager({
  lists,
  personOptions,
  offices,
  ranks,
  groups,
  mailEnabled,
  mailLog,
}: {
  lists: DistributionListWithMembers[];
  personOptions: PersonOption[];
  offices: OfficeRow[];
  ranks: RankRow[];
  groups: GroupRow[];
  /** True when the optional mail module is configured (see isMailEnabled). */
  mailEnabled: boolean;
  /** List-scoped send history, newest first (empty when the module is off). */
  mailLog: MailLogEntry[];
}) {
  const searchParams = useSearchParams();
  const selectedId = Number(searchParams.get("list")) || null;
  // A stale or unknown id (e.g. the list was just deleted) falls back to the first list.
  const activeList = lists.find((l) => l.id === selectedId) ?? lists[0] ?? null;

  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<ListDraft>(NEW_LIST);

  function select(id: number | null) {
    // Next.js syncs history.replaceState into useSearchParams; no server round trip.
    window.history.replaceState(null, "", id == null ? "/verteiler" : `/verteiler?list=${id}`);
  }

  function openForm(next: ListDraft) {
    setDraft(next);
    setFormOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Verteiler"
        subtitle="Gremien-Verteiler pflegen und als BCC-Liste oder CSV exportieren"
        actions={
          <Button onClick={() => openForm(NEW_LIST)}>
            <Plus />
            Neuer Verteiler
          </Button>
        }
      />
      <PageBody>
        {activeList ? (
          <div className="grid grid-cols-1 items-start gap-gutter lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-x-8">
            <ListNav lists={lists} activeId={activeList.id} onSelect={select} />
            <ListDetail
              list={activeList}
              personOptions={personOptions}
              offices={offices}
              ranks={ranks}
              groups={groups}
              mailEnabled={mailEnabled}
              mailLog={mailLog}
              onRename={() =>
                openForm({
                  id: activeList.id,
                  name: activeList.name,
                  description: activeList.description ?? "",
                })
              }
              onDeleted={() => select(null)}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-line-strong bg-surface">
            <EmptyState
              className="py-16"
              icon={Mail}
              title="Noch kein Verteiler angelegt."
              description="Lege über „Neuer Verteiler“ den ersten an – zum Beispiel für das Bundesthing."
            />
          </div>
        )}
      </PageBody>

      <ListFormDialog
        open={formOpen}
        draft={draft}
        onOpenChange={setFormOpen}
        onSaved={(id) => {
          setFormOpen(false);
          select(id);
        }}
      />
    </>
  );
}
