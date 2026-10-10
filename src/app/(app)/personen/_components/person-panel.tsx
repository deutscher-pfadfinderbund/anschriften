"use client";

import { useMemo } from "react";
import Link from "next/link";

import { Field, TextField, fieldAria } from "@/components/field";
import { Note } from "@/components/note";
import { Panel } from "@/components/panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RankRow } from "@/db/queries";
import { findSimilarPersons, type PersonCandidate } from "@/lib/duplicate-persons";
import { SALUTATIONS, formatNameWithScout, todayIso } from "@/lib/format";
import type { FieldErrors } from "@/lib/person-schema";
import { LINK } from "@/lib/utils";

import { NONE, type FormValues, type SetValue } from "./form-values";

const NOTES_HINT = "Interne Notiz – erscheint in keinem Druck.";

/** "Person": name, Anrede, Stand, birthday and the internal note. */
export function PersonPanel({
  values,
  errors,
  set,
  ranks,
  existingPersons,
}: {
  values: FormValues;
  errors: FieldErrors;
  set: SetValue;
  ranks: RankRow[];
  /** Create mode only: names for the non-blocking duplicate hint. */
  existingPersons?: PersonCandidate[];
}) {
  const { firstName, lastName, scoutName } = values;
  // Advisory only — it never blocks saving: softly point at a similarly named person so
  // nobody is entered twice.
  const similar = useMemo(
    () => (existingPersons ? findSimilarPersons({ firstName, lastName, scoutName }, existingPersons) : []),
    [existingPersons, firstName, lastName, scoutName],
  );
  // One rule covers both fields: the error sits under Nachname, Fahrtenname is marked too.
  const nameError = errors.lastName;

  return (
    <Panel title="Person" description="Nachname oder Fahrtenname muss ausgefüllt sein.">
      <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 sm:grid-cols-6">
        <Field label="Anrede" id="f-anrede" className="sm:col-span-2">
          <Select value={values.salutation} onValueChange={(v) => set("salutation", v)}>
            <SelectTrigger id="f-anrede" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Keine</SelectItem>
              {SALUTATIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <TextField
          className="sm:col-span-2"
          label="Titel"
          id="f-titel"
          placeholder="z. B. Dr."
          error={errors.title}
          value={values.title}
          onValueChange={(v) => set("title", v)}
        />
        <Field label="Stand" id="f-stand" className="col-span-2">
          <Select value={values.rankId} onValueChange={(v) => set("rankId", v)}>
            <SelectTrigger id="f-stand" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Kein Stand</SelectItem>
              {ranks.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <TextField
          className="col-span-2 sm:col-span-3"
          label="Vorname"
          id="f-vn"
          autoComplete="off"
          error={errors.firstName}
          value={firstName}
          onValueChange={(v) => set("firstName", v)}
        />
        <TextField
          className="col-span-2 sm:col-span-3"
          label="Nachname"
          id="f-nn"
          autoComplete="off"
          error={nameError}
          value={lastName}
          onValueChange={(v) => set("lastName", v)}
        />
        <TextField
          className="col-span-2 sm:col-span-3"
          label="Fahrtenname"
          id="f-fahrt"
          autoComplete="off"
          error={errors.scoutName}
          {...(nameError && !errors.scoutName
            ? { "aria-invalid": true, "aria-describedby": "f-nn-msg" }
            : {})}
          value={scoutName}
          // The name rule's error belongs to both fields: filling either one resolves it.
          onValueChange={(v) => set("scoutName", v, ["scoutName", "lastName"])}
        />
        <TextField
          className="col-span-2 sm:col-span-3"
          label="Geburtsdatum"
          id="f-geb"
          type="date"
          max={todayIso()}
          error={errors.birthDate}
          value={values.birthDate}
          onValueChange={(v) => set("birthDate", v)}
        />

        {similar.length > 0 ? (
          <Note className="col-span-2 sm:col-span-6">
            <p>Ähnliche Personen gibt es schon – bitte prüfen, ob es dieselbe ist:</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {similar.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/personen/${p.id}`}
                    target="_blank"
                    rel="noopener"
                    className={LINK}
                  >
                    {formatNameWithScout(p)}
                  </Link>
                  <span className="text-caption text-ink-faint"> (öffnet in neuem Tab)</span>
                </li>
              ))}
            </ul>
          </Note>
        ) : null}

        <Field
          label="Anmerkung"
          id="f-anm"
          error={errors.notes}
          hint={NOTES_HINT}
          className="col-span-2 sm:col-span-6"
        >
          <Textarea
            {...fieldAria("f-anm", errors.notes, NOTES_HINT)}
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </div>
    </Panel>
  );
}
