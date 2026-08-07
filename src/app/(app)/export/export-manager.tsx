"use client";

// Interactive PDF export form (issue #5): pick one of five profiles, toggle the
// print options and download the generated directory. Neutral surfaces; green
// (fir) only for the active marker and the primary button, per the design rules
// in AGENTS.md.
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

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

/**
 * App-wide panel treatment (border + surface + shadow, 15.5px display title,
 * 18px gutter). Deliberately a local copy: the shared `Panel` currently lives in
 * the person-form folder, and this screen must not depend on that module.
 * TODO: lift both into a shared `src/components/panel.tsx`.
 */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm">
      <div className="border-b border-line px-[18px] py-3 font-display text-[15.5px] font-semibold text-ink">
        {title}
      </div>
      <div className="p-[18px]">{children}</div>
    </section>
  );
}

/** Parse a download filename out of a Content-Disposition header, if present. */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(header);
  return match ? decodeURIComponent(match[1].replace(/"$/, "")) : null;
}

/** Trigger a browser download for an in-memory blob (keeps the user on the page). */
function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportManager() {
  const [profile, setProfile] = useState<string>(PROFILES[0].id);
  const [options, setOptions] = useState<Record<OptionId, boolean>>({
    birthdays: false,
    ranks: false,
    memorial: false,
  });
  const [pending, setPending] = useState(false);

  const params = new URLSearchParams({ profile });
  for (const { id } of OPTIONS) if (options[id]) params.set(id, "1");
  const href = `/api/export/pdf?${params.toString()}`;

  // Fetch + blob so a Typst failure surfaces as a toast instead of navigating
  // away to a bare error page, and so double-clicks can't start parallel runs.
  async function downloadPdf() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const filename =
        filenameFromDisposition(res.headers.get("Content-Disposition")) ??
        "anschriftenverzeichnis.pdf";
      triggerBlobDownload(blob, filename);
    } catch {
      toast.error("PDF konnte nicht erzeugt werden. Bitte erneut versuchen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <Panel title="Profil">
        <div className="grid gap-2 sm:grid-cols-2">
          {PROFILES.map((p) => {
            const active = profile === p.id;
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => setProfile(p.id)}
                aria-pressed={active}
                className={[
                  "rounded-lg border bg-surface-2 px-4 py-3 text-left transition-colors",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-fir" : "border-line hover:border-line-strong",
                ].join(" ")}
              >
                <span className="flex items-center gap-2">
                  {/* Radio dot — the same fir marker language as the nav and tabs. */}
                  <span
                    className={[
                      "inline-block size-3.5 rounded-full border",
                      active ? "border-fir bg-fir" : "border-line-strong",
                    ].join(" ")}
                    aria-hidden
                  />
                  <span className={active ? "font-medium text-fir" : "font-medium text-ink"}>
                    {p.label}
                  </span>
                </span>
                <span className="mt-1 block pl-6 text-xs text-ink-soft">{p.hint}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Optionen">
        {/* Chips sized to their content — a checkbox plus two words does not need
            a full-width bar. */}
        <div className="flex flex-wrap gap-2">
          {OPTIONS.map((o) => (
            <label
              key={o.id}
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-surface-2 py-1.5 pr-3 pl-2.5 text-[13.5px] text-ink transition-colors hover:border-line-strong"
            >
              <Checkbox
                checked={options[o.id]}
                onCheckedChange={(v) => setOptions((prev) => ({ ...prev, [o.id]: v === true }))}
              />
              {o.label}
            </label>
          ))}
        </div>
      </Panel>

      <div className="flex items-center gap-4">
        <Button onClick={downloadPdf} disabled={pending}>
          {pending ? "PDF wird erzeugt …" : "PDF erzeugen"}
        </Button>
        <span className="text-xs text-ink-faint">Die Erzeugung kann einige Sekunden dauern.</span>
      </div>
    </div>
  );
}
