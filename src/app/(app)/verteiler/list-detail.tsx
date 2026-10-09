"use client";

import { useRef, useState, useTransition } from "react";
import { ChevronRight, Copy, Download, Pencil, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteList } from "@/actions/lists";
import { ComposeMailDialog, emailAddressCount } from "@/components/compose-mail-dialog";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Panel } from "@/components/panel";
import { Tag } from "@/components/tag";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
  DistributionListWithMembers,
  GroupRow,
  MailLogEntry,
  OfficeRow,
  PersonOption,
  RankRow,
} from "@/db/queries";
import { callAction } from "@/lib/call-action";
import { useDownload } from "@/lib/download";
import { buildBcc, isEmail, type BccSeparator } from "@/lib/export";
import { formatDateTime, formatNameWithScout } from "@/lib/format";
import { cn } from "@/lib/utils";

import { MembersPanel } from "./members-panel";
import { RulesPanel } from "./rules-panel";

/** Header with the list's actions, then members, rules, the e-mail addresses and send history. */
export function ListDetail({
  list,
  personOptions,
  offices,
  ranks,
  groups,
  mailEnabled,
  mailLog,
  onEdit,
  onDeleted,
}: {
  list: DistributionListWithMembers;
  personOptions: PersonOption[];
  offices: OfficeRow[];
  ranks: RankRow[];
  groups: GroupRow[];
  mailEnabled: boolean;
  /** Send history of all lists, newest first (empty when the mail module is off). */
  mailLog: MailLogEntry[];
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [separator, setSeparator] = useState<BccSeparator>("; ");
  const [addressesOpen, setAddressesOpen] = useState(false);
  const addressesRef = useRef<HTMLTextAreaElement>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const csv = useDownload("csv");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { members } = list;
  const withEmail = members.filter((m) => isEmail(m.email)).length;
  const bcc = buildBcc(
    members.map((m) => m.email),
    separator,
  );
  const recentMail = mailLog.filter((e) => e.listId === list.id).slice(0, 5);

  async function copyAddresses() {
    try {
      await navigator.clipboard.writeText(bcc.text);
      toast.success(`${emailAddressCount(bcc.count)} kopiert.`, {
        description:
          bcc.skipped > 0
            ? `${bcc.skipped} ${bcc.skipped === 1 ? "Mitglied" : "Mitglieder"} ohne gültige E-Mail übersprungen.`
            : undefined,
      });
    } catch {
      // No clipboard access (blocked permission, insecure context): open the list and
      // select it, so a plain Strg+C finishes the job.
      setAddressesOpen(true);
      requestAnimationFrame(() => addressesRef.current?.focus());
      toast.error("Kopieren nicht möglich – die E-Mail-Adressen sind markiert, kopiere sie mit Strg+C.");
    }
  }

  function confirmDelete() {
    startTransition(async () => {
      const res = await callAction(() => deleteList(list.id));
      if (!res.ok) return void setDeleteError(res.message);
      toast.success("Verteiler gelöscht.");
      setDeleteOpen(false);
      onDeleted();
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-gutter">
      <header>
        <h2 className="font-display text-section font-semibold text-balance text-ink">{list.name}</h2>
        <p className="mt-0.5 text-ui text-ink-soft tabular-nums">
          {members.length} {members.length === 1 ? "Mitglied" : "Mitglieder"}
          {members.length > 0 ? ` · ${withEmail} mit E-Mail` : null}
        </p>
        {list.description ? <p className="mt-1 text-ui text-ink-faint">{list.description}</p> : null}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Same emphasis as the directory's selection bar: sending leads when it exists. */}
            {mailEnabled ? (
              <Button onClick={() => setComposeOpen(true)} disabled={bcc.count === 0}>
                <Send />
                E-Mail schreiben …
              </Button>
            ) : null}
            <Button variant={mailEnabled ? "outline" : "default"} onClick={copyAddresses} disabled={bcc.count === 0}>
              <Copy />
              E-Mail-Adressen kopieren
            </Button>
            <Button
              variant="outline"
              onClick={() => csv.start(`/api/export/csv?listId=${list.id}`)}
              disabled={csv.pending || members.length === 0}
            >
              <Download />
              {csv.pending ? "CSV wird erstellt …" : "CSV herunterladen"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" className="text-ink-soft" onClick={onEdit}>
              <Pencil />
              Bearbeiten
            </Button>
            <Button
              variant="ghost"
              className="text-ink-soft hover:text-crit"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              <Trash2 />
              Löschen
            </Button>
          </div>
        </div>
      </header>

      <MembersPanel list={list} personOptions={personOptions} />
      <RulesPanel list={list} offices={offices} ranks={ranks} groups={groups} />

      {members.length > 0 ? (
        <details
          open={addressesOpen}
          onToggle={(e) => setAddressesOpen(e.currentTarget.open)}
          className="group min-w-0 rounded-lg border border-line bg-surface"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 text-ui font-medium text-ink transition-colors select-none group-open:rounded-b-none hover:bg-hover sm:px-gutter [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden
              className="size-4 shrink-0 text-ink-faint transition-transform group-open:rotate-90"
            />
            {addressesOpen ? "E-Mail-Adressen ausblenden" : "E-Mail-Adressen anzeigen"}
            <span className="ml-auto text-caption font-normal text-ink-faint tabular-nums">
              {emailAddressCount(bcc.count)}
            </span>
          </summary>
          <div className="border-t border-line p-4 sm:p-gutter">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 pointer-coarse:mb-3">
              <p className="text-caption text-ink-soft">Zum Einfügen ins BCC-Feld deines Mailprogramms.</p>
              <div role="group" aria-label="Trennzeichen" className="inline-flex rounded-md border border-line p-0.5">
                {(
                  [
                    ["; ", "Semikolon (Outlook)"],
                    [", ", "Komma (Gmail)"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={separator === value}
                    onClick={() => setSeparator(value)}
                    className={cn(
                      "rounded-[5px] px-2 py-0.5 text-caption transition-colors",
                      // Taller tap band on touch; vertical only, so the two toggles' bands
                      // do not overlap.
                      "pointer-coarse:relative pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2",
                      separator === value
                        ? "bg-active font-medium text-fir"
                        : "text-ink-soft hover:bg-hover hover:text-ink",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              ref={addressesRef}
              readOnly
              value={bcc.text}
              aria-label="E-Mail-Adressen für das BCC-Feld"
              placeholder="Keine gültigen E-Mail-Adressen in diesem Verteiler."
              className="h-28 resize-y text-caption md:text-caption"
              onFocus={(e) => e.currentTarget.select()}
            />
            {withEmail < members.length ? (
              <p className="mt-2 text-caption text-ink-faint">
                Ohne gültige E-Mail, nur per Post erreichbar:{" "}
                {members
                  .filter((m) => !isEmail(m.email))
                  .map(formatNameWithScout)
                  .join(", ")}
              </p>
            ) : null}
          </div>
        </details>
      ) : null}

      {mailEnabled && recentMail.length > 0 ? (
        <Panel title="Zuletzt versendet" flush>
          <ul>
            {recentMail.map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-3 border-b border-line px-4 py-2.5 last:border-b-0 sm:px-gutter"
              >
                <div className="min-w-0">
                  <div className="truncate text-ui text-ink">{e.subject}</div>
                  <div className="mt-0.5 text-caption text-ink-faint tabular-nums">
                    {formatDateTime(e.sentAt)} · {e.sentBy} · {e.recipientCount} Empfänger
                  </div>
                  {e.error ? (
                    <div className={cn("mt-0.5 text-caption", e.status === "failed" ? "text-crit" : "text-ink-soft")}>
                      {e.error}
                    </div>
                  ) : null}
                </div>
                {e.status === "sent" ? <Tag>versendet</Tag> : <Tag tone="crit">fehlgeschlagen</Tag>}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Verteiler löschen?"
        description={
          <>
            „{list.name}“ wird mit allen Mitgliedschaften und Regeln gelöscht. Die Personen selbst
            bleiben erhalten. Das lässt sich nicht rückgängig machen.
            {deleteError ? (
              <span role="alert" className="mt-2 block text-crit">
                {deleteError}
              </span>
            ) : null}
          </>
        }
        confirmLabel="Verteiler löschen"
        pending={isPending}
        onConfirm={confirmDelete}
      />

      {mailEnabled ? (
        <ComposeMailDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          target={{ kind: "list", listId: list.id }}
          contextName={`den Verteiler „${list.name}“`}
          recipientCount={bcc.count}
          skippedCount={bcc.skipped}
        />
      ) : null}
    </div>
  );
}
