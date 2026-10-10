"use client";

import { memo } from "react";

import { MailLink } from "@/components/mail-link";
import { PersonLink } from "@/components/person-link";
import { Tag } from "@/components/tag";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import type { PersonListRow } from "@/db/queries";
import { birthYear, formatDate, formatNameWithScout, isVacant } from "@/lib/format";
import { cn } from "@/lib/utils";

// One person in the directory, twice: a table row (md and up) and a card (phones).
// Both are built from the same fragments below, so they cannot drift apart. Rows are
// memoized: ticking one checkbox re-renders that row only, not all ~600.

type RowProps = {
  person: PersonListRow;
  selected: boolean;
  onSelectedChange: (id: number, selected: boolean) => void;
};

/** Name line: the link, then „vakant“ / „nicht abdrucken“ / „verstorben“ chips right after it. */
function NameLine({ person, stretched }: { person: PersonListRow; stretched?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <PersonLink person={person} stretched={stretched} />
      {isVacant(person) ? (
        <Tag tone="brass" title="Platzhalter ohne Namen: das Amt ist unbesetzt">
          vakant
        </Tag>
      ) : null}
      {person.doNotPrint ? (
        <Tag tone="crit" title="Erscheint in keinem PDF-Verzeichnis">
          nicht abdrucken
        </Tag>
      ) : null}
      {person.deathDate ? (
        <Tag title={`Verstorben am ${formatDate(person.deathDate)}`}>verstorben</Tag>
      ) : null}
    </div>
  );
}

/** Quiet second line: „Stand · *Geburtsjahr · Ort“, whatever is present. */
function Subline({ person }: { person: PersonListRow }) {
  const year = birthYear(person.birthDate);
  const text = [person.rankName, year ? `*${year}` : null, person.city].filter(Boolean).join(" · ");
  return text ? <div className="text-caption tabular-nums text-ink-faint">{text}</div> : null;
}

function OfficeTags({ person, className }: { person: PersonListRow; className?: string }) {
  const offices = person.assignments.filter((a) => a.officeName);
  if (offices.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {offices.map((a) => (
        <Tag key={a.id} title={`${a.officeName} · ${a.groupName}`}>
          {a.officeName}
        </Tag>
      ))}
    </div>
  );
}

function groupNames(person: PersonListRow): string[] {
  return [...new Set(person.assignments.map((a) => a.groupName))];
}

/**
 * E-mail and every phone number (the search matches all of them); `raised` lifts the link
 * above the card's stretched name link.
 */
function Contact({ person, raised = false }: { person: PersonListRow; raised?: boolean }) {
  return (
    <>
      {person.email ? (
        <div>
          <MailLink email={person.email} className={raised ? "relative z-10" : undefined} />
        </div>
      ) : null}
      {person.phones.map((phone, i) => (
        <div key={i} className="text-caption tabular-nums text-ink-soft">
          {phone.number}
          {phone.label ? ` · ${phone.label}` : ""}
        </div>
      ))}
    </>
  );
}

function selectLabel(person: PersonListRow): string {
  return `${formatNameWithScout(person)} auswählen`;
}

/** Clicks on controls, links or after selecting text must not open the person. */
function isRowNavigation(e: React.MouseEvent): boolean {
  if ((e.target as Element).closest("a, button, label, input")) return false;
  return !window.getSelection()?.toString();
}

export const PersonTableRow = memo(function PersonTableRow({
  person,
  selected,
  onSelectedChange,
  onOpen,
}: RowProps & { onOpen: (id: number) => void }) {
  const groups = groupNames(person);
  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      onClick={(e) => {
        if (isRowNavigation(e)) onOpen(person.id);
      }}
      // --line vanishes on the --active fill; adjacent selected rows keep a divider.
      className="cursor-pointer data-[state=selected]:border-line-strong"
    >
      <TableCell className="p-0 align-top">
        {/* The whole cell toggles, so a near miss does not open the person. */}
        <label className="flex cursor-pointer py-3 pr-1 pl-3">
          <Checkbox
            aria-label={selectLabel(person)}
            checked={selected}
            onCheckedChange={(v) => onSelectedChange(person.id, v === true)}
          />
        </label>
      </TableCell>
      <TableCell className="px-3 py-2.5 align-top whitespace-normal">
        <NameLine person={person} />
        <Subline person={person} />
      </TableCell>
      <TableCell className="px-3 py-2.5 align-top whitespace-normal">
        <OfficeTags person={person} />
      </TableCell>
      <TableCell className="px-3 py-2.5 align-top whitespace-normal">
        {groups.map((name, i) => (
          <div key={name} className={i === 0 ? "text-ink" : "text-caption text-ink-faint"}>
            {name}
          </div>
        ))}
      </TableCell>
      <TableCell className="px-3 py-2.5 align-top whitespace-normal">
        <Contact person={person} />
      </TableCell>
    </TableRow>
  );
});

/** Phone layout: the name link stretches over the card; checkbox and mail link sit above it. */
export const PersonCard = memo(function PersonCard({ person, selected, onSelectedChange }: RowProps) {
  const groups = groupNames(person);
  return (
    <li
      data-state={selected ? "selected" : undefined}
      className="relative flex items-start gap-3 border-b border-line px-3 py-3 transition-colors last:border-b-0 hover:bg-hover data-[state=selected]:border-line-strong data-[state=selected]:bg-active"
    >
      <Checkbox
        aria-label={selectLabel(person)}
        checked={selected}
        onCheckedChange={(v) => onSelectedChange(person.id, v === true)}
        className="z-10 mt-0.5"
      />
      <div className="min-w-0 flex-1 text-ui">
        <NameLine person={person} stretched />
        <Subline person={person} />
        <OfficeTags person={person} className="mt-1.5" />
        {groups.length > 0 ? (
          <div className="mt-1 text-caption text-ink-soft">{groups.join(" · ")}</div>
        ) : null}
        {person.email || person.phones.length > 0 ? (
          <div className="mt-1.5">
            <Contact person={person} raised />
          </div>
        ) : null}
      </div>
    </li>
  );
});
