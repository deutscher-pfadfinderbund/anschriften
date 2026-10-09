"use client";

import { useEffect } from "react";

import { Combobox } from "@/components/combobox";
import { FormLabel } from "@/components/form-label";
import { Input } from "@/components/ui/input";

type FieldBase = {
  label: string;
  /** id of the control; the label points at it and the message gets `${id}-msg`. */
  id: string;
  /** Error under the control (wins over the hint); marks the control invalid. */
  error?: string;
  /** Quiet help line under the control. */
  hint?: string;
  className?: string;
};

/** aria wiring for the control inside a <Field>: invalid state and the message link. */
export function fieldAria(id: string, error?: string, hint?: string) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error || hint ? `${id}-msg` : undefined,
  } as const;
}

/** Label, control and an optional error or hint line. */
export function Field({ label, id, error, hint, className, children }: FieldBase & { children: React.ReactNode }) {
  const message = error ?? hint;
  return (
    <div className={className}>
      <FormLabel htmlFor={id}>{label}</FormLabel>
      {children}
      {message ? (
        <p id={`${id}-msg`} className={error ? "mt-1 text-caption text-crit" : "mt-1 text-caption text-ink-faint"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** A text (or date) input in a <Field>. */
export function TextField({
  label,
  id,
  error,
  hint,
  className,
  value,
  onValueChange,
  ...input
}: FieldBase &
  Omit<React.ComponentProps<"input">, "id" | "value" | "onChange"> & {
    value: string;
    onValueChange: (value: string) => void;
  }) {
  return (
    <Field label={label} id={id} error={error} hint={hint} className={className}>
      <Input
        {...fieldAria(id, error, hint)}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        {...input}
      />
    </Field>
  );
}

/** A Combobox in a <Field>. */
export function ComboField({
  label,
  id,
  error,
  hint,
  className,
  ...combo
}: FieldBase & Omit<React.ComponentProps<typeof Combobox>, "id">) {
  // Combobox takes no aria-invalid/aria-describedby (yet), so set them on its trigger
  // (found by id) to get the same invalid ring and announcement as the other fields.
  useEffect(() => {
    const trigger = document.getElementById(id);
    if (!trigger) return;
    const aria = fieldAria(id, error, hint);
    for (const name of ["aria-invalid", "aria-describedby"] as const) {
      const value = aria[name];
      if (value) trigger.setAttribute(name, String(value));
      else trigger.removeAttribute(name);
    }
  }, [id, error, hint]);

  return (
    <Field label={label} id={id} error={error} hint={hint} className={className}>
      <Combobox id={id} {...combo} />
    </Field>
  );
}
