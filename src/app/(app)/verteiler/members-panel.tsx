"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Lock, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";

import { addMembers, removeMember } from "@/actions/lists";
import { EmptyState } from "@/components/empty-state";
import { MailLink } from "@/components/mail-link";
import { MultiSelectList } from "@/components/multi-select-list";
import { Panel } from "@/components/panel";
import { Tag } from "@/components/tag";
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
import type { DistributionListWithMembers, ListMemberRow, PersonOption } from "@/db/queries";
import { callAction } from "@/lib/call-action";
import { isEmail } from "@/lib/export";
import { formatName, formatNameWithScout, personCount, scoutAddition } from "@/lib/format";
import { RULE_KIND_LABELS } from "@/lib/rule-kinds";

import { RULE_ICONS } from "./rule-icons";

const removeButtonId = (personId: number) => `mitglied-entfernen-${personId}`;

/** Put a removed member back (the "Rückgängig" of the removal toast). */
async function restoreMember(listId: number, m: ListMemberRow) {
  const res = await callAction(() => addMembers(listId, [m.personId]));
  if (!res.ok) return void toast.error(res.message);
  toast.success(`„${formatName(m)}“ wieder hinzugefügt.`);
}

/**
 * Who is on the list. Hand-added members have a visible remove button (undoable from
 * the toast); members a rule brings in carry that rule as chips and can only change
 * through the rules.
 */
export function MembersPanel({
  list,
  personOptions,
}: {
  list: DistributionListWithMembers;
  personOptions: PersonOption[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  // The member being removed. Only that row's button is disabled, so the others stay
  // focusable (and keyboard focus can move on to the next one).
  const [removingId, setRemovingId] = useState<number | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const { members } = list;
  const hasAutomatic = members.some((m) => m.via.length > 0);

  async function remove(m: ListMemberRow, index: number) {
    // Keyboard users keep their place: focus moves on to the next removable member.
    const hadFocus = document.activeElement?.id === removeButtonId(m.personId);
    const next = [...members.slice(index + 1), ...members.slice(0, index).reverse()].find(
      (o) => o.manual,
    );
    setRemovingId(m.personId);
    const res = await callAction(() => removeMember(list.id, m.personId));
    setRemovingId(null);
    if (!res.ok) return void toast.error(res.message);
    toast.success(
      m.via.length > 0
        ? `„${formatName(m)}“ ist nicht mehr von Hand eingetragen, bleibt aber über eine Regel enthalten.`
        : `„${formatName(m)}“ aus dem Verteiler entfernt.`,
      // A little longer than the default, so there is time to reach „Rückgängig“.
      { duration: 8000, action: { label: "Rückgängig", onClick: () => void restoreMember(list.id, m) } },
    );
    if (hadFocus) {
      const target = next ? document.getElementById(removeButtonId(next.personId)) : addButtonRef.current;
      target?.focus();
    }
  }

  return (
    <Panel
      title="Mitglieder"
      description={
        hasAutomatic
          ? "Die Kennzeichen zeigen, über welche Regel jemand automatisch enthalten ist."
          : undefined
      }
      actions={
        <Button ref={addButtonRef} variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <UserPlus />
          Mitglieder hinzufügen
        </Button>
      }
      flush
    >
      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Noch keine Mitglieder."
          description="Füge Personen über „Mitglieder hinzufügen“ hinzu oder lege unten eine Regel an."
        />
      ) : (
        // A container: the rows put name and e-mail side by side only when the panel
        // itself is wide enough (at 1024 px the list rail leaves it narrow).
        <ul className="@container">
          {members.map((m, index) => (
            <MemberRow
              key={m.personId}
              member={m}
              disabled={removingId === m.personId}
              onRemove={() => void remove(m, index)}
            />
          ))}
        </ul>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <AddMembersForm
            list={list}
            personOptions={personOptions}
            onDone={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function MemberRow({
  member: m,
  disabled,
  onRemove,
}: {
  member: ListMemberRow;
  disabled: boolean;
  onRemove: () => void;
}) {
  const scout = scoutAddition(m);
  const email = m.email?.trim() ?? "";
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-b-0 sm:px-gutter">
      <div className="min-w-0 flex-1 @xl:grid @xl:grid-cols-2 @xl:items-center @xl:gap-4">
        <div className="min-w-0">
          <div className="truncate text-ui text-ink">
            {formatName(m)}
            {scout ? <span className="ml-1.5 text-ink-soft">„{scout}“</span> : null}
          </div>
          {m.via.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {m.via.map((v) => {
                const Icon = RULE_ICONS[v.kind];
                return (
                  <Tag key={`${v.kind}-${v.id}`} title={`Automatisch über ${RULE_KIND_LABELS[v.kind]} „${v.name}“`}>
                    <Icon aria-hidden className="mr-1 inline align-[-2px]" />
                    <span className="sr-only">{RULE_KIND_LABELS[v.kind]}: </span>
                    {v.name}
                  </Tag>
                );
              })}
            </div>
          ) : m.mainOffice ? (
            <div className="truncate text-caption text-ink-faint">{m.mainOffice}</div>
          ) : null}
        </div>
        <div className="mt-0.5 min-w-0 text-caption @xl:mt-0 @xl:text-ui">
          {isEmail(email) ? (
            <MailLink email={email} />
          ) : email ? (
            <span className="text-ink-faint">{email} (keine gültige E-Mail)</span>
          ) : (
            <span className="text-ink-faint">ohne E-Mail</span>
          )}
        </div>
      </div>
      {m.manual ? (
        <Button
          id={removeButtonId(m.personId)}
          variant="ghost"
          size="icon-sm"
          aria-label={`${formatName(m)} entfernen`}
          className="text-ink-faint hover:text-crit"
          disabled={disabled}
          onClick={onRemove}
        >
          <X />
        </Button>
      ) : (
        <span
          className="grid size-7 shrink-0 place-items-center text-ink-faint"
          title="Automatisch über eine Regel enthalten – änderbar über die Regeln unten."
        >
          <Lock aria-hidden className="size-3.5 opacity-60" />
          <span className="sr-only">Automatisch enthalten, nur über die Regeln änderbar</span>
        </span>
      )}
    </li>
  );
}

/** Body of the "Mitglieder hinzufügen" dialog — mounted per opening, so it starts empty. */
function AddMembersForm({
  list,
  personOptions,
  onDone,
}: {
  list: DistributionListWithMembers;
  personOptions: PersonOption[];
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const options = useMemo(() => {
    const memberIds = new Set(list.members.map((m) => m.personId));
    // Deceased persons never count as members, so they are not offered.
    return personOptions
      .filter((p) => !memberIds.has(p.id) && p.deathDate == null)
      .map((p) => ({
        value: p.id,
        label: formatNameWithScout(p),
        hint: p.email?.trim() || "ohne E-Mail",
      }));
  }, [list.members, personOptions]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) return;
    startTransition(async () => {
      const res = await callAction(() => addMembers(list.id, [...selected]));
      if (!res.ok) return void toast.error(res.message);
      toast.success(
        `${personCount(res.added)} hinzugefügt.` +
          (res.skippedDeceased > 0
            ? ` ${res.skippedDeceased} ${res.skippedDeceased === 1 ? "verstorbene Person" : "verstorbene Personen"} übersprungen.`
            : ""),
      );
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="grid min-w-0 gap-4">
      <DialogHeader>
        <DialogTitle>Mitglieder hinzufügen</DialogTitle>
        <DialogDescription>
          Personen suchen und anklicken. Wer schon im Verteiler ist, steht nicht in der Liste.
        </DialogDescription>
      </DialogHeader>
      {/* min-w-0: grid items default to min-width:auto, so without it this box
          would be sized by the member list's min-content. */}
      <div className="min-w-0 rounded-md border border-line">
        <MultiSelectList
          options={options}
          selected={selected}
          onToggle={toggle}
          searchPlaceholder="Name oder E-Mail suchen …"
          emptyText="Keine passende Person gefunden."
        />
      </div>
      <DialogFooter className="sm:justify-between">
        <span aria-live="polite" className="text-caption text-ink-faint">
          {selected.size} ausgewählt
        </span>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Abbrechen
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isPending || selected.size === 0}>
            {isPending ? "Wird hinzugefügt …" : "Hinzufügen"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
