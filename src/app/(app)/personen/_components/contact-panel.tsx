"use client";

import { X } from "lucide-react";

import { AddRowButton } from "@/components/add-row-button";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { phoneLabelOptions } from "@/lib/format";
import type { FieldErrors } from "@/lib/person-schema";

import { TextField, focusSoon } from "./field";
import { newKey, type FormValues, type PhoneRow, type SetValue } from "./form-values";

/** "Anschrift & Kontakt": postal address, e-mail and the phone list. */
export function ContactPanel({
  values,
  errors,
  set,
}: {
  values: FormValues;
  errors: FieldErrors;
  set: SetValue;
}) {
  return (
    <Panel title="Anschrift & Kontakt">
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-3.5 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]">
        <TextField
          className="col-span-2"
          label="Straße"
          id="f-str"
          error={errors.street}
          value={values.street}
          onValueChange={(v) => set("street", v)}
        />
        <TextField
          className="col-span-2 sm:col-span-1"
          label="Anschriftenzusatz"
          id="f-zusatz"
          placeholder="z. B. c/o, Hinterhaus"
          error={errors.addressExtra}
          value={values.addressExtra}
          onValueChange={(v) => set("addressExtra", v)}
        />
        <TextField
          label="PLZ"
          id="f-plz"
          inputMode="numeric"
          className="[&_input]:tabular-nums"
          error={errors.postalCode}
          value={values.postalCode}
          onValueChange={(v) => set("postalCode", v)}
        />
        <TextField
          className="sm:col-span-2"
          label="Ort"
          id="f-ort"
          error={errors.city}
          value={values.city}
          onValueChange={(v) => set("city", v)}
        />
        <TextField
          className="col-span-2 sm:col-span-3"
          label="E-Mail"
          id="f-mail"
          type="email"
          autoComplete="off"
          error={errors.email}
          value={values.email}
          onValueChange={(v) => set("email", v)}
        />
        <PhoneList
          className="col-span-2 sm:col-span-3"
          phones={values.phones}
          onChange={(phones) => set("phones", phones)}
        />
      </div>
    </Panel>
  );
}

function PhoneList({
  phones,
  onChange,
  className,
}: {
  phones: PhoneRow[];
  onChange: (phones: PhoneRow[]) => void;
  className?: string;
}) {
  const update = (key: string, patch: Partial<PhoneRow>) =>
    onChange(phones.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  function add() {
    const key = newKey();
    onChange([...phones, { key, label: phones.length === 0 ? "Mobil" : "Telefon", number: "" }]);
    focusSoon(`tel-${key}`);
  }

  return (
    <fieldset className={className}>
      <legend className="eyebrow mb-1.5">Telefon</legend>
      {phones.length > 0 ? (
        <ul className="mb-2 flex flex-col gap-2">
          {phones.map((p) => (
            <li key={p.key} className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto]">
              <Select value={p.label} onValueChange={(label) => update(p.key, { label })}>
                <SelectTrigger className="w-full" aria-label="Art der Nummer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {phoneLabelOptions(p.label).map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id={`tel-${p.key}`}
                type="tel"
                aria-label="Telefonnummer"
                placeholder="Nummer"
                className="tabular-nums"
                value={p.number}
                onChange={(e) => update(p.key, { number: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Telefonnummer entfernen"
                title="Telefonnummer entfernen"
                className="text-ink-faint hover:text-crit"
                onClick={() => {
                  onChange(phones.filter((r) => r.key !== p.key));
                  focusSoon("tel-add");
                }}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <AddRowButton id="tel-add" onClick={add}>
        Telefonnummer hinzufügen
      </AddRowButton>
    </fieldset>
  );
}
