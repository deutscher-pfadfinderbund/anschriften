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
    <>
      <section>
        <h2 className="font-display text-base font-semibold text-ink">Profil</h2>
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
                    ? "border-fir bg-surface"
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
        <h2 className="font-display text-base font-semibold text-ink">Optionen</h2>
        <div className="mt-3 space-y-2">
          {OPTIONS.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5"
            >
              <Checkbox
                checked={options[o.id]}
                onCheckedChange={(v) => setOptions((prev) => ({ ...prev, [o.id]: v === true }))}
              />
              <span className="text-sm text-ink">{o.label}</span>
            </label>
          ))}
        </div>
      </section>

      <div className="mt-8 flex items-center gap-4">
        <Button onClick={downloadPdf} disabled={pending}>
          {pending ? "PDF wird erzeugt …" : "PDF erzeugen"}
        </Button>
        <span className="text-xs text-ink-faint">Die Erzeugung kann einige Sekunden dauern.</span>
      </div>
    </>
  );
}
