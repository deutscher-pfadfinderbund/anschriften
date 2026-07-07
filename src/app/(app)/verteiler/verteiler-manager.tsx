"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  Briefcase,
  Clock,
  Copy,
  Download,
  Layers,
  Lock,
  Mail,
  Pencil,
  Plus,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  addGroupRule,
  addMembers,
  addOfficeRule,
  addRankRule,
  createList,
  deleteList,
  removeGroupRule,
  removeMember,
  removeOfficeRule,
  removeRankRule,
  updateList,
} from "@/actions/lists";
import { Combobox } from "@/components/combobox";
import { ComposeMailDialog } from "@/components/compose-mail-dialog";
import { MultiSelectList } from "@/components/multi-select-list";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  DistributionListWithMembers,
  GroupRow,
  ListMemberRow,
  MailLogEntry,
  OfficeRow,
  PersonOption,
  RankRow,
} from "@/db/queries";
import { buildBcc, type BccSeparator } from "@/lib/export";
import { formatDateTime, formatName } from "@/lib/format";
import { cn } from "@/lib/utils";

type ListFormState = { id: number | null; name: string; description: string };

/** "Nachname, Vorname" plus the scout name when both are present. */
function memberLabel(m: {
  firstName: string | null;
  lastName: string | null;
  scoutName: string | null;
}): string {
  const base = formatName(m);
  const showScout = !!m.scoutName && !!(m.lastName || m.firstName);
  return showScout ? `${base} „${m.scoutName}“` : base;
}

function hasEmail(m: ListMemberRow): boolean {
  return !!m.email && m.email.trim().length > 0;
}

type RuleRow = { id: number; name: string };

/**
 * One "Automatisch enthalten (nach …)" card. Identical chrome for Amt, Stand and
 * Gliederung — only the icon, texts and the id/name rows differ.
 */
function RuleSection({
  icon: Icon,
  title,
  description,
  rows,
  options,
  onAdd,
  onRemove,
  emptyRules,
  addAriaLabel,
  addPlaceholder,
  searchPlaceholder,
  comboEmptyText,
  disabled,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  rows: RuleRow[];
  options: { value: string; label: string }[];
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
  emptyRules: string;
  addAriaLabel: string;
  addPlaceholder: string;
  searchPlaceholder: string;
  comboEmptyText: string;
  disabled: boolean;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm">
      <div className="border-b border-line px-[18px] py-3">
        <span className="font-display text-[15.5px] font-semibold text-ink">{title}</span>
        <p className="mt-0.5 text-[12.5px] text-ink-faint">{description}</p>
      </div>
      <div className="p-[18px]">
        {rows.length === 0 ? (
          <p className="mb-3 text-[13px] text-ink-soft">{emptyRules}</p>
        ) : (
          <ul className="mb-3 flex flex-col gap-1.5">
            {rows.map((r) => (
              <li
                key={r.id}
                className="group/rule flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-[13.5px]"
              >
                <Icon className="size-3.5 shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Regel „${r.name}“ entfernen`}
                  className="shrink-0 text-ink-faint opacity-0 transition-opacity hover:text-crit group-hover/rule:opacity-100"
                  disabled={disabled}
                  onClick={() => onRemove(r.id)}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="max-w-sm">
          <Combobox
            aria-label={addAriaLabel}
            options={options}
            value={null}
            onChange={(v) => onAdd(Number(v))}
            placeholder={addPlaceholder}
            searchPlaceholder={searchPlaceholder}
            emptyText={comboEmptyText}
          />
        </div>
      </div>
    </section>
  );
}

export function VerteilerManager({
  lists,
  personOptions,
  offices,
  ranks,
  groups,
  initialListId,
  mailEnabled = false,
  mailLog = [],
}: {
  lists: DistributionListWithMembers[];
  personOptions: PersonOption[];
  offices: OfficeRow[];
  ranks: RankRow[];
  groups: GroupRow[];
  initialListId?: number | null;
  /** True when the optional mail module is configured (see isMailEnabled). */
  mailEnabled?: boolean;
  /** List-scoped send history, newest first (empty when the module is off). */
  mailLog?: MailLogEntry[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedListId, setSelectedListId] = useState<number | null>(
    initialListId ?? lists[0]?.id ?? null,
  );
  const [separator, setSeparator] = useState<BccSeparator>("; ");

  const [listForm, setListForm] = useState<ListFormState | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addSelection, setAddSelection] = useState<Set<number>>(new Set());
  const [composeOpen, setComposeOpen] = useState(false);

  // Reconcile the selection with the (possibly refreshed) server data: keep the
  // chosen list if it still exists, otherwise fall back to the first one.
  const activeList = useMemo(
    () => lists.find((l) => l.id === selectedListId) ?? lists[0] ?? null,
    [lists, selectedListId],
  );

  const members = useMemo(() => activeList?.members ?? [], [activeList]);
  const withEmail = members.filter(hasEmail);
  const withoutEmail = members.filter((m) => !hasEmail(m));
  const bcc = useMemo(
    () => buildBcc(members.map((m) => m.email), separator),
    [members, separator],
  );

  // Send history for the active list (newest first, capped for the card).
  const recentMail = useMemo(
    () => (activeList ? mailLog.filter((e) => e.listId === activeList.id).slice(0, 5) : []),
    [mailLog, activeList],
  );

  const addOptions = useMemo(() => {
    if (!activeList) return [];
    const memberIds = new Set(activeList.members.map((m) => m.personId));
    return personOptions
      .filter((p) => !memberIds.has(p.id))
      .map((p) => ({
        value: p.id,
        label: memberLabel(p),
        hint: p.email && p.email.trim() ? p.email : "ohne E-Mail",
      }));
  }, [activeList, personOptions]);

  function copyBcc() {
    if (bcc.text.length === 0) {
      toast.error("Keine E-Mail-Adressen zum Kopieren.");
      return;
    }
    navigator.clipboard.writeText(bcc.text).then(
      () =>
        toast.success(
          `${bcc.count} Adressen kopiert${
            bcc.skipped > 0 ? ` (${bcc.skipped} ohne E-Mail übersprungen)` : ""
          }.`,
        ),
      () => toast.error("Kopieren nicht möglich."),
    );
  }

  function submitListForm() {
    if (!listForm) return;
    const { id } = listForm;
    const payload = { name: listForm.name, description: listForm.description || null };
    startTransition(async () => {
      if (id != null) {
        const res = await updateList(id, payload);
        if (!res.ok) return void toast.error(res.message);
        toast.success("Verteiler gespeichert.");
      } else {
        const res = await createList(payload);
        if (!res.ok) return void toast.error(res.message);
        setSelectedListId(res.id);
        toast.success("Verteiler angelegt.");
      }
      setListForm(null);
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!activeList) return;
    startTransition(async () => {
      const res = await deleteList(activeList.id);
      if (!res.ok) return void toast.error(res.message);
      toast.success("Verteiler gelöscht.");
      setDeleteOpen(false);
      setSelectedListId(null);
      router.refresh();
    });
  }

  function submitAddMembers() {
    if (!activeList || addSelection.size === 0) return;
    const ids = [...addSelection];
    startTransition(async () => {
      const res = await addMembers(activeList.id, ids);
      if (!res.ok) return void toast.error(res.message);
      toast.success(`${ids.length} ${ids.length === 1 ? "Mitglied" : "Mitglieder"} hinzugefügt.`);
      setAddOpen(false);
      setAddSelection(new Set());
      router.refresh();
    });
  }

  function handleRemove(personId: number) {
    if (!activeList) return;
    startTransition(async () => {
      const res = await removeMember(activeList.id, personId);
      if (!res.ok) return void toast.error(res.message);
      router.refresh();
    });
  }

  // Offices not yet a rule on the active list — the "+ Amt hinzufügen" combobox.
  const ruleOfficeOptions = useMemo(() => {
    if (!activeList) return [];
    const existing = new Set(activeList.officeRules.map((r) => r.officeId));
    return offices
      .filter((o) => !existing.has(o.id))
      .map((o) => ({ value: String(o.id), label: o.name }));
  }, [activeList, offices]);

  function handleAddRule(officeId: number) {
    if (!activeList || !Number.isInteger(officeId)) return;
    startTransition(async () => {
      const res = await addOfficeRule(activeList.id, officeId);
      if (!res.ok) return void toast.error(res.message);
      const name = offices.find((o) => o.id === officeId)?.name ?? "Amt";
      toast.success(`Regel „${name}“ hinzugefügt.`);
      router.refresh();
    });
  }

  function handleRemoveRule(officeId: number) {
    if (!activeList) return;
    startTransition(async () => {
      const res = await removeOfficeRule(activeList.id, officeId);
      if (!res.ok) return void toast.error(res.message);
      router.refresh();
    });
  }

  // Stände not yet a rule on the active list — the "+ Stand hinzufügen" combobox.
  const ruleRankOptions = useMemo(() => {
    if (!activeList) return [];
    const existing = new Set(activeList.rankRules.map((r) => r.rankId));
    return ranks.filter((r) => !existing.has(r.id)).map((r) => ({ value: String(r.id), label: r.name }));
  }, [activeList, ranks]);

  function handleAddRankRule(rankId: number) {
    if (!activeList || !Number.isInteger(rankId)) return;
    startTransition(async () => {
      const res = await addRankRule(activeList.id, rankId);
      if (!res.ok) return void toast.error(res.message);
      const name = ranks.find((r) => r.id === rankId)?.name ?? "Stand";
      toast.success(`Regel „${name}“ hinzugefügt.`);
      router.refresh();
    });
  }

  function handleRemoveRankRule(rankId: number) {
    if (!activeList) return;
    startTransition(async () => {
      const res = await removeRankRule(activeList.id, rankId);
      if (!res.ok) return void toast.error(res.message);
      router.refresh();
    });
  }

  // Gliederungen not yet a rule on the active list — the "+ Gliederung hinzufügen" combobox.
  const ruleGroupOptions = useMemo(() => {
    if (!activeList) return [];
    const existing = new Set(activeList.groupRules.map((r) => r.groupId));
    return groups.filter((g) => !existing.has(g.id)).map((g) => ({ value: String(g.id), label: g.name }));
  }, [activeList, groups]);

  function handleAddGroupRule(groupId: number) {
    if (!activeList || !Number.isInteger(groupId)) return;
    startTransition(async () => {
      const res = await addGroupRule(activeList.id, groupId);
      if (!res.ok) return void toast.error(res.message);
      const name = groups.find((g) => g.id === groupId)?.name ?? "Gliederung";
      toast.success(`Regel „${name}“ hinzugefügt.`);
      router.refresh();
    });
  }

  function handleRemoveGroupRule(groupId: number) {
    if (!activeList) return;
    startTransition(async () => {
      const res = await removeGroupRule(activeList.id, groupId);
      if (!res.ok) return void toast.error(res.message);
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader
        title="Verteiler"
        subtitle="Gremien-Verteiler pflegen und als BCC-Liste oder CSV exportieren"
      />
      <div className="px-6 pt-[18px] pb-10">
        <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[260px_1fr]">
          {/* Left: list of distribution lists */}
          <section className="rounded-lg border border-line bg-surface shadow-sm">
            <div className="border-b border-line px-4 py-3 font-display text-[15.5px] font-semibold text-ink">
              Verteiler
            </div>
            {lists.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-ink-faint">Noch keine Verteiler.</p>
            ) : (
              <ul className="py-1.5">
                {lists.map((l) => {
                  const active = activeList?.id === l.id;
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedListId(l.id)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2 border-l-2 px-3.5 py-2 text-left text-[13.5px] transition-colors",
                          active
                            ? "border-fir bg-fir-tint font-medium text-ink"
                            : "border-transparent text-ink-soft hover:bg-sel hover:text-ink",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{l.name}</span>
                        <span className="tabular-nums text-xs text-ink-faint">
                          {l.members.length}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="border-t border-line p-2.5">
              <button
                type="button"
                onClick={() => setListForm({ id: null, name: "", description: "" })}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong py-2 text-[13px] text-ink-soft transition-colors hover:border-fir hover:text-fir"
              >
                <Plus className="size-3.5" />
                Neuer Verteiler
              </button>
            </div>
          </section>

          {/* Right: detail */}
          {activeList ? (
            <div className="flex flex-col gap-[18px]">
              <section className="rounded-lg border border-line bg-surface shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-[18px] py-3.5">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold text-ink">
                      {activeList.name}
                    </h2>
                    <p className="mt-0.5 text-[13px] text-ink-soft">
                      {members.length} {members.length === 1 ? "Mitglied" : "Mitglieder"} ·{" "}
                      {withEmail.length} mit E-Mail
                    </p>
                    {activeList.description ? (
                      <p className="mt-1 text-[13px] text-ink-faint">{activeList.description}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {mailEnabled ? (
                      <Button onClick={() => setComposeOpen(true)}>
                        <Send className="size-4" />
                        E-Mail schreiben …
                      </Button>
                    ) : null}
                    <Button variant={mailEnabled ? "outline" : "default"} onClick={copyBcc}>
                      <Copy className="size-4" />
                      Alle E-Mails kopieren
                    </Button>
                    <Button variant="outline" asChild>
                      <a href={`/api/export/csv?listId=${activeList.id}`}>
                        <Download className="size-4" />
                        CSV herunterladen
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setListForm({
                          id: activeList.id,
                          name: activeList.name,
                          description: activeList.description ?? "",
                        })
                      }
                    >
                      <Pencil className="size-4" />
                      Umbenennen
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-ink-faint hover:text-crit"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 className="size-4" />
                      Löschen
                    </Button>
                  </div>
                </div>

                <div className="p-[18px]">
                  {withoutEmail.length > 0 ? (
                    <p className="mb-3 rounded-md border border-brass/40 bg-brass-tint px-3 py-2 text-[12.5px] text-ink-soft">
                      <span className="font-medium text-ink">
                        {withoutEmail.length}{" "}
                        {withoutEmail.length === 1 ? "Mitglied" : "Mitglieder"} ohne E-Mail-Adresse:
                      </span>{" "}
                      {withoutEmail.map(memberLabel).join(", ")} — nur postalisch erreichbar.
                    </p>
                  ) : null}

                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <Label className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-faint">
                      <Mail className="size-3.5" />
                      BCC-Vorschau
                    </Label>
                    <div className="inline-flex rounded-md border border-line p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setSeparator("; ")}
                        className={cn(
                          "rounded-[5px] px-2 py-0.5 transition-colors",
                          separator === "; "
                            ? "bg-ink font-medium text-paper"
                            : "text-ink-soft hover:text-ink",
                        )}
                      >
                        Semikolon (Outlook)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSeparator(", ")}
                        className={cn(
                          "rounded-[5px] px-2 py-0.5 transition-colors",
                          separator === ", "
                            ? "bg-ink font-medium text-paper"
                            : "text-ink-soft hover:text-ink",
                        )}
                      >
                        Komma (Gmail)
                      </button>
                    </div>
                  </div>
                  <Textarea
                    readOnly
                    value={bcc.text}
                    aria-label="BCC-Vorschau"
                    placeholder="Keine E-Mail-Adressen in diesem Verteiler."
                    className="h-24 resize-y font-mono text-[12.5px]"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <div className="mt-2">
                    <Button variant="outline" size="sm" onClick={copyBcc}>
                      <Copy className="size-3.5" />
                      Kopieren
                    </Button>
                  </div>
                </div>
              </section>

              {/* Send history (optional mail module) */}
              {mailEnabled && recentMail.length > 0 ? (
                <section className="rounded-lg border border-line bg-surface shadow-sm">
                  <div className="flex items-center gap-2 border-b border-line px-[18px] py-3">
                    <Clock className="size-3.5 text-ink-faint" />
                    <span className="font-display text-[15.5px] font-semibold text-ink">
                      Zuletzt versendet
                    </span>
                  </div>
                  <ul>
                    {recentMail.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-start justify-between gap-3 border-b border-line px-[18px] py-2.5 text-[13.5px] last:border-b-0"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-ink">{e.subject}</div>
                          <div className="mt-0.5 text-[12px] text-ink-faint">
                            {formatDateTime(e.sentAt)} · {e.sentBy} · {e.recipientCount} Empfänger
                          </div>
                        </div>
                        {e.status === "sent" ? (
                          <span className="shrink-0 rounded-[4px] border border-fir/40 bg-fir-tint px-1.5 py-px text-[10.5px] font-medium text-fir">
                            versendet
                          </span>
                        ) : (
                          <span
                            className="shrink-0 rounded-[4px] bg-crit-tint px-1.5 py-px text-[10.5px] font-semibold text-crit"
                            title={e.error ?? undefined}
                          >
                            fehlgeschlagen
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* Automatic membership rules — same shape for Amt, Stand and Gliederung. */}
              <RuleSection
                icon={Briefcase}
                title="Automatisch enthalten (nach Amt)"
                description="Wer eines dieser Ämter innehat, ist automatisch Mitglied — bei einem Amtswechsel wandert die Mitgliedschaft mit."
                rows={activeList.officeRules.map((r) => ({ id: r.officeId, name: r.officeName }))}
                options={ruleOfficeOptions}
                onAdd={handleAddRule}
                onRemove={handleRemoveRule}
                emptyRules="Noch keine Amts-Regel."
                addAriaLabel="Amt als Regel hinzufügen"
                addPlaceholder="+ Amt hinzufügen"
                searchPlaceholder="Amt suchen …"
                comboEmptyText="Kein Amt gefunden."
                disabled={isPending}
              />

              <RuleSection
                icon={Award}
                title="Automatisch enthalten (nach Stand)"
                description="Wer einen dieser Stände trägt, ist automatisch Mitglied — z. B. alle Ordensritter und St.-Georgs-Ritter."
                rows={activeList.rankRules.map((r) => ({ id: r.rankId, name: r.rankName }))}
                options={ruleRankOptions}
                onAdd={handleAddRankRule}
                onRemove={handleRemoveRankRule}
                emptyRules="Noch keine Stand-Regel."
                addAriaLabel="Stand als Regel hinzufügen"
                addPlaceholder="+ Stand hinzufügen"
                searchPlaceholder="Stand suchen …"
                comboEmptyText="Kein Stand gefunden."
                disabled={isPending}
              />

              <RuleSection
                icon={Layers}
                title="Automatisch enthalten (nach Gliederung)"
                description="Wer aktiv einer dieser Gliederungen zugeordnet ist, ist automatisch Mitglied — z. B. die ganze Bundesführung."
                rows={activeList.groupRules.map((r) => ({ id: r.groupId, name: r.groupName }))}
                options={ruleGroupOptions}
                onAdd={handleAddGroupRule}
                onRemove={handleRemoveGroupRule}
                emptyRules="Noch keine Gliederungs-Regel."
                addAriaLabel="Gliederung als Regel hinzufügen"
                addPlaceholder="+ Gliederung hinzufügen"
                searchPlaceholder="Gliederung suchen …"
                comboEmptyText="Keine Gliederung gefunden."
                disabled={isPending}
              />

              {/* Members */}
              <section className="rounded-lg border border-line bg-surface shadow-sm">
                <div className="flex items-center justify-between border-b border-line px-[18px] py-3">
                  <span className="font-display text-[15.5px] font-semibold text-ink">
                    Mitglieder
                  </span>
                  <Button size="sm" onClick={() => setAddOpen(true)}>
                    <UserPlus className="size-4" />
                    Mitglieder hinzufügen
                  </Button>
                </div>
                {members.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-ink-faint">
                    <Users className="size-6 opacity-40" />
                    <p className="text-[13px]">Noch keine Mitglieder in diesem Verteiler.</p>
                  </div>
                ) : (
                  <ul>
                    {members.map((m) => (
                      <li
                        key={m.personId}
                        className="group/row flex items-center gap-3 border-b border-line px-[18px] py-2 text-[13.5px] last:border-b-0 hover:bg-sel"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-ink">
                            {formatName(m)}
                            {m.scoutName && (m.lastName || m.firstName) ? (
                              <span className="ml-1.5 font-normal text-fir">„{m.scoutName}“</span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            {m.manual ? (
                              <span className="rounded-[4px] border border-line px-1.5 py-px text-[10.5px] text-ink-faint">
                                manuell
                              </span>
                            ) : null}
                            {m.viaOffices.map((o) => (
                              <span
                                key={`o${o.id}`}
                                className="rounded-[4px] border border-line px-1.5 py-px text-[10.5px] text-ink-soft"
                              >
                                über Amt: {o.name}
                              </span>
                            ))}
                            {m.viaRanks.map((r) => (
                              <span
                                key={`r${r.id}`}
                                className="rounded-[4px] border border-line px-1.5 py-px text-[10.5px] text-ink-soft"
                              >
                                über Stand: {r.name}
                              </span>
                            ))}
                            {m.viaGroups.map((g) => (
                              <span
                                key={`g${g.id}`}
                                className="rounded-[4px] border border-line px-1.5 py-px text-[10.5px] text-ink-soft"
                              >
                                über Gliederung: {g.name}
                              </span>
                            ))}
                            {m.mainOffice &&
                            m.viaOffices.length === 0 &&
                            m.viaRanks.length === 0 &&
                            m.viaGroups.length === 0 ? (
                              <span className="text-xs text-ink-faint">{m.mainOffice}</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="hidden min-w-0 flex-1 sm:block">
                          {hasEmail(m) ? (
                            <a
                              href={`mailto:${m.email}`}
                              className="truncate text-fir hover:underline"
                            >
                              {m.email}
                            </a>
                          ) : (
                            <span className="text-ink-faint">— ohne E-Mail</span>
                          )}
                        </div>
                        {m.manual ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`${formatName(m)} entfernen`}
                            className="shrink-0 text-ink-faint opacity-0 transition-opacity hover:text-crit group-hover/row:opacity-100"
                            disabled={isPending}
                            onClick={() => handleRemove(m.personId)}
                          >
                            <X className="size-4" />
                          </Button>
                        ) : (
                          <span
                            className="shrink-0 text-ink-faint"
                            title="Über ein Amt enthalten — die Regel entfernen oder der Person das Amt entziehen."
                          >
                            <Lock className="size-3.5 opacity-50" />
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : (
            <section className="grid place-items-center rounded-lg border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
              <div>
                <Mail className="mx-auto mb-3 size-7 text-ink-faint opacity-50" />
                <p className="text-[14px] text-ink">Noch kein Verteiler angelegt.</p>
                <p className="mt-1 text-[13px] text-ink-faint">
                  Lege einen neuen Verteiler an, um E-Mail-Listen und CSV-Exporte zu erzeugen.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setListForm({ id: null, name: "", description: "" })}
                >
                  <Plus className="size-4" />
                  Neuer Verteiler
                </Button>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Create / rename dialog */}
      <Dialog open={listForm != null} onOpenChange={(o) => !o && setListForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {listForm?.id != null ? "Verteiler umbenennen" : "Neuer Verteiler"}
            </DialogTitle>
            <DialogDescription>
              Verteiler bündeln Anschriften für E-Mail-Listen und Serienbriefe.
            </DialogDescription>
          </DialogHeader>
          {listForm ? (
            <div className="flex flex-col gap-3">
              <div>
                <Label
                  htmlFor="list-name"
                  className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-faint"
                >
                  Name
                </Label>
                <Input
                  id="list-name"
                  autoFocus
                  value={listForm.name}
                  onChange={(e) => setListForm({ ...listForm, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitListForm();
                  }}
                  placeholder="z. B. Bundesthing"
                />
              </div>
              <div>
                <Label
                  htmlFor="list-desc"
                  className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-faint"
                >
                  Beschreibung (optional)
                </Label>
                <Textarea
                  id="list-desc"
                  value={listForm.description}
                  onChange={(e) => setListForm({ ...listForm, description: e.target.value })}
                  placeholder="Wofür wird dieser Verteiler verwendet?"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setListForm(null)} disabled={isPending}>
              Abbrechen
            </Button>
            <Button onClick={submitListForm} disabled={isPending || !listForm?.name.trim()}>
              {isPending ? "Speichern …" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verteiler löschen?</DialogTitle>
            <DialogDescription>
              „{activeList?.name}“ wird mit allen {activeList?.members.length ?? 0} Mitgliedschaften
              gelöscht. Die Anschriften selbst bleiben erhalten. Diese Aktion kann nicht rückgängig
              gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isPending}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isPending}>
              {isPending ? "Löschen …" : "Endgültig löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add members dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setAddSelection(new Set());
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mitglieder hinzufügen</DialogTitle>
            <DialogDescription>
              Anschriften suchen und auswählen. Bereits enthaltene Mitglieder werden ausgeblendet.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-line">
            <MultiSelectList
              options={addOptions}
              selected={addSelection}
              onToggle={(value) =>
                setAddSelection((prev) => {
                  const next = new Set(prev);
                  if (next.has(value)) next.delete(value);
                  else next.add(value);
                  return next;
                })
              }
              searchPlaceholder="Name, Fahrtenname oder E-Mail suchen …"
              emptyText="Keine passende Anschrift gefunden."
            />
          </div>
          <DialogFooter className="sm:justify-between">
            <span className="text-[13px] text-ink-faint">
              {addSelection.size} ausgewählt
            </span>
            <div className="flex gap-2">
              <DialogClose asChild>
                <Button variant="outline" disabled={isPending}>
                  Abbrechen
                </Button>
              </DialogClose>
              <Button onClick={submitAddMembers} disabled={isPending || addSelection.size === 0}>
                {isPending ? "Hinzufügen …" : `Hinzufügen (${addSelection.size})`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compose mail (optional mail module) */}
      {mailEnabled && activeList ? (
        <ComposeMailDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          target={{ kind: "list", listId: activeList.id }}
          contextName={`den Verteiler „${activeList.name}“`}
          recipientCount={bcc.count}
          skippedCount={bcc.skipped}
          onSent={() => router.refresh()}
        />
      ) : null}
    </>
  );
}
