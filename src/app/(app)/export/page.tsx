"use client";

// PDF export screen (issue #5): pick one of five profiles, toggle the print options and
// download the generated directory. Neutral surfaces; green (fir) only for the active card
// and the primary button, per the design rules in AGENTS.md.
import { useState } from "react";

const PROFILES = [
  { id: "komplett", label: "Komplett", hint: "Alle Gliederungen und Älterengemeinschaften" },
  { id: "nurBundesaemter", label: "Nur Bundesämter", hint: "Ohne Älterengemeinschaften" },
  { id: "nurBundesgilde", label: "Bundesgilde", hint: "Nur die Bundesgilde" },
  { id: "nurOrdenStGeorg", label: "Orden St. Georg", hint: "Nur der Orden St. Georg" },
  {
    id: "nurOrdenStChristophorus",
    label: "Orden St. Christophorus",
    hint: "Nur der Orden St. Christophorus",
  },
] as const;

const OPTIONS = [
  { id: "birthdays", label: "Geburtsdaten andrucken" },
  { id: "ranks", label: "Stände andrucken" },
  { id: "memorial", label: "Gedenkseite (Verstorbene)" },
] as const;

type OptionId = (typeof OPTIONS)[number]["id"];

export default function ExportPage() {
  const [profile, setProfile] = useState<string>(PROFILES[0].id);
  const [options, setOptions] = useState<Record<OptionId, boolean>>({
    birthdays: false,
    ranks: false,
    memorial: false,
  });

  const params = new URLSearchParams({ profile });
  for (const { id } of OPTIONS) if (options[id]) params.set(id, "1");
  const href = `/api/export/pdf?${params.toString()}`;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <p className="text-xs uppercase tracking-widest text-ink-faint">Deutscher Pfadfinderbund</p>
      <h1 className="font-display text-3xl font-semibold text-ink">PDF-Export</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Anschriftenverzeichnis als druckfertiges PDF erzeugen. Wähle ein Profil und die
        gewünschten Optionen.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-ink">Profil</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PROFILES.map((p) => {
            const active = profile === p.id;
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => setProfile(p.id)}
                aria-pressed={active}
                className={[
                  "rounded-lg border px-4 py-3 text-left transition-colors",
                  active
                    ? "border-fir bg-fir-tint"
                    : "border-line bg-surface hover:border-line-strong",
                ].join(" ")}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={[
                      "inline-block h-3.5 w-3.5 rounded-full border",
                      active ? "border-fir bg-fir" : "border-line-strong",
                    ].join(" ")}
                    aria-hidden
                  />
                  <span className="font-medium text-ink">{p.label}</span>
                </span>
                <span className="mt-1 block pl-6 text-xs text-ink-soft">{p.hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-ink">Optionen</h2>
        <div className="mt-3 space-y-2">
          {OPTIONS.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5"
            >
              <input
                type="checkbox"
                checked={options[o.id]}
                onChange={(e) => setOptions((prev) => ({ ...prev, [o.id]: e.target.checked }))}
                className="h-4 w-4 accent-fir"
              />
              <span className="text-sm text-ink">{o.label}</span>
            </label>
          ))}
        </div>
      </section>

      <div className="mt-8 flex items-center gap-4">
        <a
          href={href}
          className="inline-flex items-center rounded-lg bg-fir px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-fir-deep"
        >
          PDF erzeugen
        </a>
        <span className="text-xs text-ink-faint">Die Erzeugung kann einige Sekunden dauern.</span>
      </div>
    </main>
  );
}
