"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

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
import type { GroupRow, OfficeRow, PersonEditData, RankRow } from "@/db/queries";
import { PHONE_LABELS, SALUTATIONS, formatDateTime, formatName } from "@/lib/format";
import { orderGroups } from "@/lib/groups";
import type { FieldErrors, PersonInput } from "@/lib/person-schema";

const NONE = "none";
const OFFICE_NONE = "none";

type PhoneRow = { key: string; label: string; number: string };
type AssignmentRow = { key: string; groupId: number | null; officeId: number | null };

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

// --- form -------------------------------------------------------------------

export function PersonForm({
  mode,
  person,
  groups,
  offices,
  ranks,
}: {
  mode: "create" | "edit";
  person?: PersonEditData;
  groups: GroupRow[];
  offices: OfficeRow[];
  ranks: RankRow[];
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
    if (existing.length === 0) return [{ key: "a0", groupId: null, officeId: null }];
    return existing.map((a, i) => ({ key: `a${i}`, groupId: a.groupId, officeId: a.officeId }));
  });

  const [errors, setErrors] = useState<FieldErrors>({});

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
      const combo = `${a.groupId}:${a.officeId ?? "null"}`;
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
      : "Neue Anschrift";
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
        .map((a) => ({ groupId: a.groupId as number, officeId: a.officeId })),
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

            <Panel title="Ämter & Gliederung" hint="mehrere möglich · Amt optional">
              <div className="flex flex-col gap-2.5">
                {assignments.map((a) => {
                  const isDup = duplicateKeys.has(a.key);
                  return (
                    <div key={a.key}>
                      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2.5">
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Zuordnung entfernen"
                          onClick={() => setAssignments((rows) => rows.filter((r) => r.key !== a.key))}
                          className="text-ink-faint hover:text-crit"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                      {a.officeId != null && a.groupId == null ? (
                        <p className="mt-1 text-xs text-ink-faint">Bitte eine Gliederung wählen.</p>
                      ) : null}
                      {isDup ? (
                        <p className="mt-1 text-xs text-crit">Diese Kombination ist bereits zugeordnet.</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setAssignments((rows) => [...rows, { key: nextKey(), groupId: null, officeId: null }])}
                className="mt-2.5 w-full rounded-md border border-dashed border-line-strong py-2 text-[13px] text-ink-soft transition-colors hover:border-fir hover:text-fir"
              >
                + Amt hinzufügen
              </button>
            </Panel>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-[18px]">
            <Panel title="Verteiler">
              <p className="text-[13px] text-ink-soft">
                Die Zuordnung zu Verteilern (Bundesthing, Bundesrat …) folgt mit dem Verteiler-Modul.
              </p>
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
    </>
  );
}
