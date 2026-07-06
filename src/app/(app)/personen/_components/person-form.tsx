"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, ChevronDown, ChevronRight, Pencil, Plus, TriangleAlert, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";

import {
  addHistoricalAssignment,
  deleteAssignment,
  endAssignment,
  getActiveHolders,
  updateHistoricalAssignment,
} from "@/actions/assignments";
import { deletePerson, savePerson } from "@/actions/persons";
import { Combobox, type ComboOption } from "@/components/combobox";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActiveHolder, GroupRow, HistoricalAssignment, OfficeRow, PersonEditData, RankRow } from "@/db/queries";
import { PHONE_LABELS, SALUTATIONS, formatDate, formatDateTime, formatName } from "@/lib/format";
import { orderGroups } from "@/lib/groups";
import type { FieldErrors, PersonInput } from "@/lib/person-schema";
import { cn } from "@/lib/utils";

const NONE = "none";
const OFFICE_NONE = "none";

type PhoneRow = { key: string; label: string; number: string };
// `id` is the persisted assignment id (null for a freshly added row). Only persisted
// active rows can be "ended" (they need a DB row to move into the history).
type AssignmentRow = {
  key: string;
  id: number | null;
  groupId: number | null;
  officeId: number | null;
  startDate: string;
  // Optional "bis": a row with an end date is saved as a finished tenure (history),
  // so past offices can be captured directly — also when creating a new person.
  endDate: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

// --- small presentational helpers -----------------------------------------

function Field({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label
        htmlFor={htmlFor}
        className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-faint"
      >
        {label}
      </Label>
      {children}
      {error ? <p className="mt-1 text-xs text-crit">{error}</p> : null}
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-line px-[18px] py-3 font-display text-[15.5px] font-semibold text-ink">
        <span>{title}</span>
        {hint ? <span className="font-sans text-xs font-normal text-ink-faint">{hint}</span> : null}
      </div>
      <div className="p-[18px]">{children}</div>
    </section>
  );
}

/**
 * "Bis"-Datum plus a "Datum unbekannt" checkbox (issue #26). Ticking it disables the
 * date field; the server then records end_date = today and end_unknown = true.
 */
function EndDateChoice({
  idPrefix,
  endDate,
  endUnknown,
  onDate,
  onUnknown,
}: {
  idPrefix: string;
  endDate: string;
  endUnknown: boolean;
  onDate: (v: string) => void;
  onUnknown: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Field label="Bis" htmlFor={`${idPrefix}-date`}>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          value={endUnknown ? "" : endDate}
          disabled={endUnknown}
          onChange={(e) => onDate(e.target.value)}
        />
      </Field>
      <label className="flex items-center gap-2 text-[13px] text-ink-soft">
        <Checkbox checked={endUnknown} onCheckedChange={(v) => onUnknown(v === true)} />
        Datum unbekannt
      </label>
    </div>
  );
}

// --- form -------------------------------------------------------------------

export function PersonForm({
  mode,
  person,
  groups,
  offices,
  ranks,
  distributionLists,
}: {
  mode: "create" | "edit";
  person?: PersonEditData;
  groups: GroupRow[];
  offices: OfficeRow[];
  ranks: RankRow[];
  distributionLists: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const keyCounter = useRef(0);
  const nextKey = () => `k${keyCounter.current++}`;

  const [salutation, setSalutation] = useState(person?.salutation ?? NONE);
  const [title, setTitle] = useState(person?.title ?? "");
  const [firstName, setFirstName] = useState(person?.firstName ?? "");
  const [lastName, setLastName] = useState(person?.lastName ?? "");
  const [scoutName, setScoutName] = useState(person?.scoutName ?? "");
  const [birthDate, setBirthDate] = useState(person?.birthDate ?? "");
  const [deathDate, setDeathDate] = useState(person?.deathDate ?? "");
  const [rankId, setRankId] = useState(person?.rankId != null ? String(person.rankId) : NONE);
  const [street, setStreet] = useState(person?.street ?? "");
  const [addressExtra, setAddressExtra] = useState(person?.addressExtra ?? "");
  const [postalCode, setPostalCode] = useState(person?.postalCode ?? "");
  const [city, setCity] = useState(person?.city ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [notes, setNotes] = useState(person?.notes ?? "");
  const [doNotPrint, setDoNotPrint] = useState(person?.doNotPrint ?? false);

  const [phones, setPhones] = useState<PhoneRow[]>(() => {
    const existing = person?.phones ?? [];
    if (existing.length === 0) return [{ key: "p0", label: "mobil", number: "" }];
    return existing.map((p, i) => ({ key: `p${i}`, label: p.label, number: p.number }));
  });

  const [assignments, setAssignments] = useState<AssignmentRow[]>(() => {
    const existing = person?.assignments ?? [];
    if (existing.length === 0)
      return [{ key: "a0", id: null, groupId: null, officeId: null, startDate: "", endDate: "" }];
    return existing.map((a, i) => ({
      key: `a${i}`,
      id: a.id,
      groupId: a.groupId,
      officeId: a.officeId,
      startDate: a.startDate ?? "",
      endDate: "",
    }));
  });

  const [listIds, setListIds] = useState<Set<number>>(
    () => new Set(person?.distributionListIds ?? []),
  );

  // Lists this person belongs to automatically because a rule matches them (held
  // office, Stand or Gliederung). These checkboxes render locked + ticked; the
  // editable `listIds` state below still only ever carries the *manual* memberships.
  const ruleReasonsByList = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of person?.ruleMemberships ?? []) {
      map.set(r.listId, r.reasons.join(", "));
    }
    return map;
  }, [person?.ruleMemberships]);

  const [errors, setErrors] = useState<FieldErrors>({});

  // Office history (issue #22). Ended tenures are read straight from the server props
  // and refreshed via router.refresh() after each history mutation, so unsaved edits to
  // the active rows above survive. `startHistory` runs the immediate history actions.
  const historical = person?.historicalAssignments ?? [];
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isHistoryPending, startHistory] = useTransition();
  // Active row being ended via the "Amt beenden…" dialog (only persisted rows).
  // `endUnknown` toggles "Datum unbekannt" (disables the date field).
  const [endTarget, setEndTarget] = useState<{
    key: string;
    id: number;
    endDate: string;
    endUnknown: boolean;
  } | null>(null);
  // Add/edit dialog for a past tenure. `id` null = new entry.
  type HistForm = {
    id: number | null;
    groupId: number | null;
    officeId: number | null;
    startDate: string;
    endDate: string;
    endUnknown: boolean;
  };
  const [histForm, setHistForm] = useState<HistForm | null>(null);

  // --- Amtsinhaber-Warnung (issue #26) -------------------------------------------
  // On-demand cache of active holders per "officeId:groupId" combination (no polling).
  const [holdersCache, setHoldersCache] = useState<Map<string, ActiveHolder[]>>(new Map());
  // Buffered "end this foreign tenure on save" orders, keyed by the target assignmentId.
  // Nothing is written until savePerson runs them in its transaction.
  type EndPreviousOrder = {
    assignmentId: number;
    personId: number;
    name: string;
    endDate: string;
    endUnknown: boolean;
  };
  const [endPrevious, setEndPrevious] = useState<Map<number, EndPreviousOrder>>(new Map());
  // The "Amtszeit von {Name} beenden…" dialog before an order is buffered.
  const [holderDialog, setHolderDialog] = useState<
    { assignmentId: number; personId: number; name: string; endDate: string; endUnknown: boolean } | null
  >(null);

  // The active office+group combinations to check for existing holders: a row needs an
  // office AND a group AND no "bis" date (an ended row is history, not a new assignment).
  const activeComboKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const a of assignments) {
      if (a.groupId != null && a.officeId != null && !a.endDate) keys.add(`${a.officeId}:${a.groupId}`);
    }
    return [...keys];
  }, [assignments]);

  // Fetch holders for any combination not cached yet. Re-runs when the set of active
  // combinations changes (or the cache updates — guarded by the empty-missing early
  // return, so no loop and no dependency lint warning).
  useEffect(() => {
    const missing = activeComboKeys.filter((k) => !holdersCache.has(k));
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        missing.map(async (k) => {
          const [officeId, groupId] = k.split(":").map(Number);
          return [k, await getActiveHolders(officeId, groupId)] as const;
        }),
      );
      if (cancelled) return;
      setHoldersCache((prev) => {
        const next = new Map(prev);
        for (const [k, v] of entries) next.set(k, v);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeComboKeys, holdersCache]);

  const groupOptions: ComboOption[] = useMemo(
    () =>
      orderGroups(groups).map(({ group, depth }) => ({
        value: String(group.id),
        label: group.name,
        depth,
      })),
    [groups],
  );
  const officeOptions: ComboOption[] = useMemo(
    () => [
      { value: OFFICE_NONE, label: "— kein Amt (nur Mitglied) —" },
      ...offices.map((o) => ({ value: String(o.id), label: o.name })),
    ],
    [offices],
  );

  // Duplicate (group+office) detection for the assignment rows.
  const duplicateKeys = useMemo(() => {
    const seen = new Map<string, string>();
    const dups = new Set<string>();
    for (const a of assignments) {
      if (a.groupId == null) continue;
      // The end date is part of the identity: one active row plus finished tenures
      // of the same combination are fine, only exact duplicates are flagged.
      const combo = `${a.groupId}:${a.officeId ?? "null"}:${a.endDate || "active"}`;
      if (seen.has(combo)) {
        dups.add(a.key);
        dups.add(seen.get(combo)!);
      } else {
        seen.set(combo, a.key);
      }
    }
    return dups;
  }, [assignments]);

  const heading =
    mode === "edit" && person
      ? formatName(person) + (person.scoutName && (person.lastName || person.firstName) ? ` „${person.scoutName}“` : "")
      : "Neue Person";
  const subtitle =
    mode === "edit"
      ? "Anschrift bearbeiten"
      : "Neue Person im Anschriftenverzeichnis anlegen";

  function updatePhone(key: string, patch: Partial<PhoneRow>) {
    setPhones((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function updateAssignment(key: string, patch: Partial<AssignmentRow>) {
    setAssignments((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function handleSave() {
    if (duplicateKeys.size > 0) {
      toast.error("Dieselbe Amt-Gliederungs-Kombination ist doppelt zugeordnet.");
      return;
    }
    // Only send buffered orders that still map to a visible warning: if the user changed
    // or removed the row after buffering, the order is stale and must not fire silently.
    const liveOrders: EndPreviousOrder[] = [];
    const seenOrders = new Set<number>();
    for (const a of assignments) {
      for (const h of otherHolders(a)) {
        const order = endPrevious.get(h.assignmentId);
        if (order && !seenOrders.has(order.assignmentId)) {
          seenOrders.add(order.assignmentId);
          liveOrders.push(order);
        }
      }
    }
    const payload: PersonInput = {
      id: person?.id,
      salutation: salutation === NONE ? null : salutation,
      title: title || null,
      firstName: firstName || null,
      lastName: lastName || null,
      scoutName: scoutName || null,
      birthDate: birthDate || null,
      deathDate: deathDate || null,
      rankId: rankId === NONE ? null : Number(rankId),
      street: street || null,
      addressExtra: addressExtra || null,
      postalCode: postalCode || null,
      city: city || null,
      email: email || null,
      notes: notes || null,
      phones: phones
        .filter((p) => p.number.trim().length > 0)
        .map((p) => ({ label: p.label, number: p.number })),
      doNotPrint,
      assignments: assignments
        .filter((a) => a.groupId != null)
        .map((a) => ({
          groupId: a.groupId as number,
          officeId: a.officeId,
          startDate: a.startDate || null,
          endDate: a.endDate || null,
        })),
      // Buffered holder-warning follow-ups: end these foreign tenures in the same save.
      // "Ende unbekannt" carries no date — the server sets end_date = today.
      endPrevious: liveOrders.map((o) => ({
        assignmentId: o.assignmentId,
        endDate: o.endUnknown ? null : o.endDate || null,
        endUnknown: o.endUnknown,
      })),
      distributionListIds: [...listIds],
    };

    startTransition(async () => {
      const res = await savePerson(payload);
      if (!res.ok) {
        setErrors(res.errors);
        toast.error(res.message ?? "Bitte die markierten Felder prüfen.");
        return;
      }
      setErrors({});
      toast.success(mode === "create" ? "Anschrift angelegt." : "Änderungen gespeichert.");
      router.push("/");
      router.refresh();
    });
  }

  function handleDelete() {
    if (!person) return;
    startDelete(async () => {
      await deletePerson(person.id);
      toast.success("Anschrift gelöscht.");
      router.push("/");
      router.refresh();
    });
  }

  // --- office history: immediate server actions + router.refresh() ---------------

  /** Confirm the "Amt beenden…" dialog: end the active tenure and drop it from the buffer. */
  function confirmEnd() {
    if (!endTarget) return;
    startHistory(async () => {
      const res = await endAssignment({
        assignmentId: endTarget.id,
        endDate: endTarget.endUnknown ? null : endTarget.endDate,
        endUnknown: endTarget.endUnknown,
      });
      if (!res.ok) return void toast.error(res.message);
      // Row is now history: remove it from the active buffer so a later save cannot
      // recreate it, and refresh so it appears under "Frühere Ämter".
      setAssignments((rows) => rows.filter((r) => r.key !== endTarget.key));
      setEndTarget(null);
      toast.success("Amt beendet und in die Historie verschoben.");
      router.refresh();
    });
  }

  /** Save the add/edit history dialog. */
  function submitHistForm() {
    if (!histForm || !person) return;
    if (histForm.groupId == null) return void toast.error("Bitte eine Gliederung wählen.");
    if (!histForm.endUnknown && !histForm.endDate)
      return void toast.error("Bitte ein Bis-Datum angeben oder „Datum unbekannt“ wählen.");
    startHistory(async () => {
      const common = {
        groupId: histForm.groupId as number,
        officeId: histForm.officeId,
        startDate: histForm.startDate || null,
        endDate: histForm.endUnknown ? null : histForm.endDate,
        endUnknown: histForm.endUnknown,
      };
      const res =
        histForm.id != null
          ? await updateHistoricalAssignment({ assignmentId: histForm.id, ...common })
          : await addHistoricalAssignment({ personId: person.id, ...common });
      if (!res.ok) return void toast.error(res.message);
      setHistForm(null);
      toast.success(histForm.id != null ? "Früheres Amt gespeichert." : "Früheres Amt hinzugefügt.");
      router.refresh();
    });
  }

  /** Delete a history entry ("Eintrag löschen"). */
  function removeHistorical(id: number) {
    startHistory(async () => {
      const res = await deleteAssignment({ assignmentId: id });
      if (!res.ok) return void toast.error(res.message);
      toast.success("Eintrag gelöscht.");
      router.refresh();
    });
  }

  /**
   * "01.01.2015 – 31.12.2019", "… – ?" when the end is unknown, "bis 31.12.2019" when
   * only the end is known, or "Ende unbekannt" when neither start nor a real end exists.
   */
  function historyRange(h: HistoricalAssignment): string {
    const from = formatDate(h.startDate);
    const to = h.endUnknown ? "?" : formatDate(h.endDate);
    if (from) return `${from} – ${to}`;
    return h.endUnknown ? "Ende unbekannt" : `bis ${to}`;
  }

  /**
   * Active holders of this row's office+group that are NOT the person being edited —
   * the ones the warning is about. Empty until the on-demand fetch resolves.
   */
  function otherHolders(a: AssignmentRow): ActiveHolder[] {
    if (a.groupId == null || a.officeId == null || a.endDate) return [];
    const holders = holdersCache.get(`${a.officeId}:${a.groupId}`) ?? [];
    return holders.filter((h) => h.personId !== person?.id);
  }

  /** Confirm the holder dialog: buffer an "end previous tenure" order (no write yet). */
  function confirmHolderDialog() {
    if (!holderDialog) return;
    setEndPrevious((prev) => {
      const next = new Map(prev);
      next.set(holderDialog.assignmentId, {
        assignmentId: holderDialog.assignmentId,
        personId: holderDialog.personId,
        name: holderDialog.name,
        endDate: holderDialog.endDate,
        endUnknown: holderDialog.endUnknown,
      });
      return next;
    });
    setHolderDialog(null);
  }

  /** Undo a buffered "end previous tenure" order. */
  function cancelEndPrevious(assignmentId: number) {
    setEndPrevious((prev) => {
      const next = new Map(prev);
      next.delete(assignmentId);
      return next;
    });
  }

  return (
    <>
      <PageHeader title={heading} subtitle={subtitle} backHref="/" backLabel="Zurück zum Verzeichnis" />
      <div className="px-6 pt-[18px] pb-10">
        <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1fr_320px]">
          {/* Left column */}
          <div className="flex flex-col gap-[18px]">
            <Panel title="Person">
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Anrede" htmlFor="f-anrede">
                  <Select value={salutation} onValueChange={setSalutation}>
                    <SelectTrigger id="f-anrede" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {SALUTATIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Titel" htmlFor="f-titel">
                  <Input id="f-titel" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dr., Prof. …" />
                </Field>
                <Field label="Stand" htmlFor="f-stand">
                  <Select value={rankId} onValueChange={setRankId}>
                    <SelectTrigger id="f-stand" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {ranks.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Vorname" htmlFor="f-vn">
                  <Input id="f-vn" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </Field>
                <Field label="Nachname" htmlFor="f-nn" error={errors.lastName}>
                  <Input
                    id="f-nn"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    aria-invalid={!!errors.lastName}
                  />
                </Field>
              </div>
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Fahrtenname" htmlFor="f-fahrt">
                  <Input id="f-fahrt" value={scoutName} onChange={(e) => setScoutName(e.target.value)} />
                </Field>
                <Field label="Geburtsdatum" htmlFor="f-geb">
                  <Input id="f-geb" type="date" value={birthDate ?? ""} onChange={(e) => setBirthDate(e.target.value)} />
                </Field>
              </div>
              <Field label="Anmerkung" htmlFor="f-anm">
                <Textarea
                  id="f-anm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Interne Notiz, erscheint nirgends im Druck"
                />
              </Field>
            </Panel>

            <Panel title="Anschrift & Kontakt">
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Straße" htmlFor="f-str">
                  <Input id="f-str" value={street} onChange={(e) => setStreet(e.target.value)} />
                </Field>
                <Field label="Adresszusatz" htmlFor="f-zusatz">
                  <Input id="f-zusatz" value={addressExtra} onChange={(e) => setAddressExtra(e.target.value)} placeholder="c/o, Hinterhaus …" />
                </Field>
              </div>
              <div className="mb-3 grid grid-cols-[110px_1fr] gap-3">
                <Field label="PLZ" htmlFor="f-plz" error={errors.postalCode}>
                  <Input
                    id="f-plz"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    inputMode="numeric"
                    aria-invalid={!!errors.postalCode}
                  />
                </Field>
                <Field label="Ort" htmlFor="f-ort">
                  <Input id="f-ort" value={city} onChange={(e) => setCity(e.target.value)} />
                </Field>
              </div>
              <Field label="E-Mail" htmlFor="f-mail" error={errors.email} className="mb-3">
                <Input
                  id="f-mail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!errors.email}
                />
              </Field>

              <Label className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-faint">
                Telefon
              </Label>
              <div className="flex flex-col gap-2">
                {phones.map((p) => (
                  <div key={p.key} className="grid grid-cols-[130px_1fr_auto] items-center gap-2">
                    <Select value={p.label} onValueChange={(v) => updatePhone(p.key, { label: v })}>
                      <SelectTrigger className="w-full" aria-label="Art der Nummer">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PHONE_LABELS.map((l) => (
                          <SelectItem key={l} value={l}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={p.number}
                      onChange={(e) => updatePhone(p.key, { number: e.target.value })}
                      placeholder="0911 5550172"
                      className="tabular-nums"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Nummer entfernen"
                      onClick={() => setPhones((rows) => rows.filter((r) => r.key !== p.key))}
                      className="text-ink-faint hover:text-crit"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPhones((rows) => [...rows, { key: nextKey(), label: "Telefon", number: "" }])}
                className="mt-2 inline-flex items-center gap-1 text-[13px] text-ink-soft transition-colors hover:text-fir"
              >
                <Plus className="size-3.5" />
                weitere Nummer
              </button>
            </Panel>

            <Panel
              title="Ämter & Gliederung"
              hint="Amt optional · „seit“ optional · mit „bis“ wird es als früheres Amt gespeichert"
            >
              <div className="flex flex-col gap-2.5">
                {assignments.map((a) => {
                  const isDup = duplicateKeys.has(a.key);
                  return (
                    <div key={a.key}>
                      <div className="grid grid-cols-[1fr_1fr_118px_118px_auto] items-end gap-2.5">
                        <Field label="Amt">
                          <Combobox
                            aria-label="Amt"
                            options={officeOptions}
                            value={a.officeId != null ? String(a.officeId) : null}
                            onChange={(v) =>
                              updateAssignment(a.key, { officeId: v === OFFICE_NONE ? null : Number(v) })
                            }
                            placeholder="Amt (optional)"
                            searchPlaceholder="Amt suchen …"
                            emptyText="Kein Amt gefunden."
                          />
                        </Field>
                        <Field label="Gliederung">
                          <Combobox
                            aria-label="Gliederung"
                            options={groupOptions}
                            value={a.groupId != null ? String(a.groupId) : null}
                            onChange={(v) => updateAssignment(a.key, { groupId: Number(v) })}
                            placeholder="Gliederung wählen"
                            searchPlaceholder="Gliederung suchen …"
                            emptyText="Keine Gliederung gefunden."
                          />
                        </Field>
                        <Field label="seit">
                          <Input
                            type="date"
                            aria-label="Amt seit"
                            value={a.startDate}
                            onChange={(e) => updateAssignment(a.key, { startDate: e.target.value })}
                          />
                        </Field>
                        <Field label="bis (für frühere Ämter)">
                          <Input
                            type="date"
                            aria-label="Amt bis"
                            value={a.endDate}
                            onChange={(e) => updateAssignment(a.key, { endDate: e.target.value })}
                          />
                        </Field>
                        <div className="flex items-center">
                          {a.id != null ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Amt beenden"
                              title="Amt beenden – verschiebt es in die Historie"
                              onClick={() =>
                                setEndTarget({ key: a.key, id: a.id!, endDate: todayIso(), endUnknown: false })
                              }
                              className="text-ink-faint hover:text-fir"
                            >
                              <CalendarOff className="size-4" />
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Eintrag löschen"
                            title="Eintrag löschen (Fehleingabe)"
                            onClick={() => setAssignments((rows) => rows.filter((r) => r.key !== a.key))}
                            className="text-ink-faint hover:text-crit"
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      </div>
                      {a.officeId != null && a.groupId == null ? (
                        <p className="mt-1 text-xs text-ink-faint">Bitte eine Gliederung wählen.</p>
                      ) : null}
                      {isDup ? (
                        <p className="mt-1 text-xs text-crit">Diese Kombination ist bereits zugeordnet.</p>
                      ) : null}
                      {otherHolders(a).map((h) => {
                        const order = endPrevious.get(h.assignmentId);
                        if (order) {
                          // A follow-up is buffered: show a chip with an undo, no more warning.
                          return (
                            <div
                              key={h.assignmentId}
                              className="mt-1.5 flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink-soft"
                            >
                              <span className="min-w-0">
                                Amtszeit von <span className="font-medium text-ink">{order.name}</span> wird beendet
                                <span className="text-ink-faint">
                                  {" · "}
                                  {order.endUnknown ? "Ende unbekannt" : formatDate(order.endDate)}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => cancelEndPrevious(h.assignmentId)}
                                className="ml-auto inline-flex shrink-0 items-center gap-1 text-ink-faint transition-colors hover:text-ink"
                              >
                                <Undo2 className="size-3.5" />
                                Rückgängig
                              </button>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={h.assignmentId}
                            className="mt-1.5 flex items-center gap-2 rounded-md border border-brass/40 bg-brass/5 px-2.5 py-1.5 text-xs text-ink-soft"
                          >
                            <TriangleAlert className="size-3.5 shrink-0 text-brass" />
                            <span className="min-w-0">
                              <span className="font-medium text-ink">{h.name}</span> hat dieses Amt aktuell inne
                              {h.startDate ? ` (seit ${formatDate(h.startDate)})` : ""}.
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setHolderDialog({
                                  assignmentId: h.assignmentId,
                                  personId: h.personId,
                                  name: h.name,
                                  endDate: todayIso(),
                                  endUnknown: false,
                                })
                              }
                              className="ml-auto shrink-0 whitespace-nowrap font-medium text-fir transition-colors hover:underline"
                            >
                              Amtszeit von {h.name} beenden…
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() =>
                  setAssignments((rows) => [
                    ...rows,
                    { key: nextKey(), id: null, groupId: null, officeId: null, startDate: "", endDate: "" },
                  ])
                }
                className="mt-2.5 w-full rounded-md border border-dashed border-line-strong py-2 text-[13px] text-ink-soft transition-colors hover:border-fir hover:text-fir"
              >
                + Amt hinzufügen
              </button>

              {mode === "edit" && person ? (
                <HistorySection
                  historical={historical}
                  open={historyOpen}
                  onToggle={() => setHistoryOpen((o) => !o)}
                  onAdd={() =>
                    setHistForm({
                      id: null,
                      groupId: null,
                      officeId: null,
                      startDate: "",
                      endDate: "",
                      endUnknown: false,
                    })
                  }
                  onEdit={(h) =>
                    setHistForm({
                      id: h.id,
                      groupId: h.groupId,
                      officeId: h.officeId,
                      startDate: h.startDate ?? "",
                      // An "Ende unbekannt" entry has a synthetic end_date (today); don't
                      // prefill it into the date input — the checkbox represents it instead.
                      endDate: h.endUnknown ? "" : h.endDate ?? "",
                      endUnknown: h.endUnknown,
                    })
                  }
                  onDelete={removeHistorical}
                  range={historyRange}
                  busy={isHistoryPending}
                />
              ) : null}
            </Panel>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-[18px]">
            <Panel
              title="Verteiler"
              hint={listIds.size > 0 ? `${listIds.size} zugeordnet` : undefined}
            >
              {distributionLists.length === 0 ? (
                <p className="text-[13px] text-ink-soft">
                  Noch keine Verteiler angelegt. Unter „Verteiler“ lassen sich welche erstellen.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {distributionLists.map((l) => {
                    const viaRule = ruleReasonsByList.get(l.id);
                    const isRuleBased = viaRule != null;
                    // Ticked when a manual membership OR a rule applies; locked when a
                    // rule applies (the rule, not this checkbox, controls it then).
                    const checked = listIds.has(l.id) || isRuleBased;
                    return (
                      <label
                        key={l.id}
                        className={cn(
                          "flex items-center gap-2.5 text-[13.5px]",
                          isRuleBased ? "cursor-default text-ink-faint" : "cursor-pointer text-ink",
                        )}
                        title={
                          isRuleBased
                            ? `Automatisch enthalten (${viaRule}) — über den Verteiler oder die zugrunde liegende Regel änderbar.`
                            : undefined
                        }
                      >
                        <Checkbox
                          checked={checked}
                          disabled={isRuleBased}
                          onCheckedChange={
                            isRuleBased
                              ? undefined
                              : (v) =>
                                  setListIds((prev) => {
                                    const next = new Set(prev);
                                    if (v === true) next.add(l.id);
                                    else next.delete(l.id);
                                    return next;
                                  })
                          }
                        />
                        <span className="min-w-0">
                          {l.name}
                          {isRuleBased ? (
                            <span className="ml-1.5 text-xs text-ink-faint">· {viaRule}</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </Panel>
            <Panel title="Druck & Gedenken">
              <label className="flex items-start justify-between gap-3">
                <span className="text-[13.5px] text-ink">
                  Nicht abdrucken
                  <span className="mt-0.5 block text-xs text-ink-faint">Erscheint in keinem PDF-Verzeichnis</span>
                </span>
                <Checkbox checked={doNotPrint} onCheckedChange={(v) => setDoNotPrint(v === true)} className="mt-0.5" />
              </label>
              <hr className="my-3 border-line" />
              <Field label="Todesdatum" htmlFor="f-tod">
                <Input id="f-tod" type="date" value={deathDate ?? ""} onChange={(e) => setDeathDate(e.target.value)} />
                <span className="mt-1 block text-xs text-ink-faint">Verschiebt den Eintrag ins Gedenken.</span>
              </Field>
            </Panel>
          </div>
        </div>

        <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Speichern …" : "Speichern"}
          </Button>
          <Button variant="outline" onClick={() => router.push("/")} disabled={isPending}>
            Abbrechen
          </Button>
          {mode === "edit" && person ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive" disabled={isDeleting}>
                  <Trash2 className="size-4" />
                  Löschen
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Anschrift löschen?</DialogTitle>
                  <DialogDescription>
                    {formatName(person)} wird endgültig aus dem Verzeichnis entfernt. Diese Aktion kann nicht rückgängig gemacht werden.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Abbrechen</Button>
                  </DialogClose>
                  <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                    {isDeleting ? "Löschen …" : "Endgültig löschen"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
          {mode === "edit" && person?.updatedAt ? (
            <span className="ml-auto text-xs text-ink-faint">
              Zuletzt geändert {formatDateTime(person.updatedAt)}
              {person.updatedBy ? ` von ${person.updatedBy}` : ""}
            </span>
          ) : null}
        </div>
      </div>

      {/* End an active tenure → moves it into the history */}
      <Dialog open={endTarget != null} onOpenChange={(o) => !o && setEndTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Amt beenden</DialogTitle>
            <DialogDescription>
              Das Amt wird zum angegebenen Datum beendet und wandert in „Frühere Ämter“. Der
              Eintrag bleibt erhalten, zählt aber nicht mehr für Verzeichnis, PDF und Verteiler.
            </DialogDescription>
          </DialogHeader>
          {endTarget ? (
            <EndDateChoice
              idPrefix="f-end"
              endDate={endTarget.endDate}
              endUnknown={endTarget.endUnknown}
              onDate={(v) => setEndTarget({ ...endTarget, endDate: v })}
              onUnknown={(v) => setEndTarget({ ...endTarget, endUnknown: v })}
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndTarget(null)} disabled={isHistoryPending}>
              Abbrechen
            </Button>
            <Button
              onClick={confirmEnd}
              disabled={isHistoryPending || (!endTarget?.endUnknown && !endTarget?.endDate)}
            >
              {isHistoryPending ? "Beenden …" : "Amt beenden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / edit a past tenure */}
      <Dialog open={histForm != null} onOpenChange={(o) => !o && setHistForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {histForm?.id != null ? "Früheres Amt bearbeiten" : "Früheres Amt hinzufügen"}
            </DialogTitle>
            <DialogDescription>
              Ein bereits beendetes Amt für die rückwirkende Erfassung. Bis-Datum angeben
              oder „Datum unbekannt“ wählen; das Von-Datum ist optional.
            </DialogDescription>
          </DialogHeader>
          {histForm ? (
            <div className="flex flex-col gap-3">
              <Field label="Amt">
                <Combobox
                  aria-label="Amt"
                  options={officeOptions}
                  value={histForm.officeId != null ? String(histForm.officeId) : null}
                  onChange={(v) =>
                    setHistForm({ ...histForm, officeId: v === OFFICE_NONE ? null : Number(v) })
                  }
                  placeholder="Amt (optional)"
                  searchPlaceholder="Amt suchen …"
                  emptyText="Kein Amt gefunden."
                />
              </Field>
              <Field label="Gliederung">
                <Combobox
                  aria-label="Gliederung"
                  options={groupOptions}
                  value={histForm.groupId != null ? String(histForm.groupId) : null}
                  onChange={(v) => setHistForm({ ...histForm, groupId: Number(v) })}
                  placeholder="Gliederung wählen"
                  searchPlaceholder="Gliederung suchen …"
                  emptyText="Keine Gliederung gefunden."
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="von" htmlFor="f-hist-from">
                  <Input
                    id="f-hist-from"
                    type="date"
                    value={histForm.startDate}
                    onChange={(e) => setHistForm({ ...histForm, startDate: e.target.value })}
                  />
                </Field>
                <Field label="bis" htmlFor="f-hist-to">
                  <Input
                    id="f-hist-to"
                    type="date"
                    value={histForm.endUnknown ? "" : histForm.endDate}
                    disabled={histForm.endUnknown}
                    onChange={(e) => setHistForm({ ...histForm, endDate: e.target.value })}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-[13px] text-ink-soft">
                <Checkbox
                  checked={histForm.endUnknown}
                  onCheckedChange={(v) => setHistForm({ ...histForm, endUnknown: v === true })}
                />
                Ende unbekannt
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistForm(null)} disabled={isHistoryPending}>
              Abbrechen
            </Button>
            <Button onClick={submitHistForm} disabled={isHistoryPending}>
              {isHistoryPending ? "Speichern …" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Holder warning: buffer an "end previous tenure" order — written only on save */}
      <Dialog open={holderDialog != null} onOpenChange={(o) => !o && setHolderDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Amtszeit von {holderDialog?.name} beenden</DialogTitle>
            <DialogDescription>
              Die Amtszeit wird erst beim <strong>Speichern</strong> beendet. Bis dahin lässt sich
              die Entscheidung rückgängig machen; brichst du das Formular ab, bleibt alles
              unverändert. „Datum unbekannt“ wählen, wenn das Ende nicht mehr bekannt ist.
            </DialogDescription>
          </DialogHeader>
          {holderDialog ? (
            <EndDateChoice
              idPrefix="f-holder"
              endDate={holderDialog.endDate}
              endUnknown={holderDialog.endUnknown}
              onDate={(v) => setHolderDialog({ ...holderDialog, endDate: v })}
              onUnknown={(v) => setHolderDialog({ ...holderDialog, endUnknown: v })}
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHolderDialog(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={confirmHolderDialog}
              disabled={!holderDialog?.endUnknown && !holderDialog?.endDate}
            >
              Übernehmen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// --- "Frühere Ämter" — dezenter, einklappbarer Historienabschnitt ---------------

function HistorySection({
  historical,
  open,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
  range,
  busy,
}: {
  historical: HistoricalAssignment[];
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onEdit: (h: HistoricalAssignment) => void;
  onDelete: (id: number) => void;
  range: (h: HistoricalAssignment) => string;
  busy: boolean;
}) {
  return (
    <div className="mt-4 border-t border-line pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        Frühere Ämter
        {historical.length > 0 ? (
          <span className="font-normal text-ink-faint">({historical.length})</span>
        ) : null}
      </button>
      {open ? (
        <div className="mt-2.5 flex flex-col gap-1.5">
          {historical.length === 0 ? (
            <p className="text-xs text-ink-faint">Keine früheren Ämter erfasst.</p>
          ) : (
            historical.map((h) => (
              <div
                key={h.id}
                className="group/hist flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[13px]"
              >
                <span className="min-w-0 text-ink-soft">
                  {h.officeName ? (
                    <span className="text-ink">{h.officeName}</span>
                  ) : (
                    <span className="italic">ohne Amt</span>
                  )}
                  <span className="text-ink-faint"> · {h.groupName} · </span>
                  <span className="tabular-nums">{range(h)}</span>
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/hist:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Bearbeiten"
                    disabled={busy}
                    onClick={() => onEdit(h)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Eintrag löschen"
                    disabled={busy}
                    className="text-ink-faint hover:text-crit"
                    onClick={() => onDelete(h.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </div>
            ))
          )}
          <button
            type="button"
            onClick={onAdd}
            disabled={busy}
            className="mt-1 inline-flex items-center gap-1 self-start text-[13px] text-ink-soft transition-colors hover:text-fir disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            Früheres Amt hinzufügen
          </button>
        </div>
      ) : null}
    </div>
  );
}
