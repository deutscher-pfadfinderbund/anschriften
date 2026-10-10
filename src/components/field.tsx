"use client";

import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";

type FieldBase = {
  label: string;
  /** id of the control; the label points at it and the message gets `${id}-msg`. */
  id: string;
  /** Error under the control (wins over the hint); marks the control invalid. */
  error?: string;
  /** Quiet help line under the control. */
  hint?: string;
  /** Announce the error as it appears: a refused save, not validation while typing. */
  announce?: boolean;
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
export function Field({
  label,
  id,
  error,
  hint,
  announce,
  className,
  children,
}: FieldBase & { children: React.ReactNode }) {
  const message = error ?? hint;
  return (
    <div className={className}>
      <label htmlFor={id} className="eyebrow mb-1.5 block">
        {label}
      </label>
      {children}
      {message ? (
        <p
          id={`${id}-msg`}
          role={error && announce ? "alert" : undefined}
          className={error ? "mt-1 text-caption text-crit" : "mt-1 text-caption text-ink-faint"}
        >
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
  announce,
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
    <Field label={label} id={id} error={error} hint={hint} announce={announce} className={className}>
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
  announce,
  className,
  ...combo
}: FieldBase & Omit<React.ComponentProps<typeof Combobox>, "id" | "aria-invalid" | "aria-describedby">) {
  return (
    <Field label={label} id={id} error={error} hint={hint} announce={announce} className={className}>
      <Combobox {...fieldAria(id, error, hint)} {...combo} />
    </Field>
  );
}

/** A refused save's message under a dialog form, announced when it appears. */
export function FormError({ children }: { children: React.ReactNode }) {
  return children ? (
    <p role="alert" className="text-ui text-crit">
      {children}
    </p>
  ) : null;
}

/** Focus an element by id once the current update is rendered (after a button vanished). */
export function focusSoon(id: string): void {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

/** focusSoon for keyboard users only (focus is visible): a tap must not open the phone keyboard. */
export function focusSoonIfKeyboard(id: string): void {
  if (document.activeElement?.matches(":focus-visible")) focusSoon(id);
}
