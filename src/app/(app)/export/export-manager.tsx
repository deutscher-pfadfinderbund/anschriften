"use client";

// Interactive PDF export form (issue #5): pick one of five profiles, toggle the print
// options and download the generated directory. A calm radio list, plain checkbox rows
// and one primary button; fir only for the checked dot and that button.
import { useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";

import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useDownload } from "@/lib/download";
import { SECTION_LABELS } from "@/lib/sections";
import { LINK } from "@/lib/utils";

const { bund, jungenbund, maedchenbund, bundesgilde, orden_st_georg, orden_st_christophorus } = SECTION_LABELS;

const PROFILES = [
  { id: "komplett", label: "Komplett", hint: `Alle Gliederungen mit Orden und ${bundesgilde}` },
  { id: "nurBundesaemter", label: "Bundesämter", hint: `${bund}, ${jungenbund} und ${maedchenbund} – ohne Älterengemeinschaften` },
  { id: "nurBundesgilde", label: bundesgilde, hint: `Nur die ${bundesgilde}` },
  { id: "nurOrdenStGeorg", label: orden_st_georg, hint: `Nur der ${orden_st_georg}` },
  { id: "nurOrdenStChristophorus", label: orden_st_christophorus, hint: `Nur der ${orden_st_christophorus}` },
] as const;

const OPTIONS = [
  { id: "birthdays", label: "Geburtsdaten abdrucken" },
  { id: "ranks", label: "Stände abdrucken" },
  { id: "memorial", label: "Gedenkseite (Verstorbene)" },
] as const;

type OptionId = (typeof OPTIONS)[number]["id"];

/** One row of the radio list and the checkbox list: full width, neutral hover. */
const ROW = "flex cursor-pointer gap-3 px-4 py-2.5 transition-colors hover:bg-hover sm:px-gutter";

/**
 * Native radio, redrawn in the field skin: --control ring, fir dot when checked. Focus
 * uses the app-wide :focus-visible outline.
 */
const RADIO =
  "mt-0.5 grid size-4 shrink-0 cursor-pointer appearance-none place-content-center rounded-full border border-control bg-field transition-colors " +
  "before:size-2 before:rounded-full before:bg-fir before:opacity-0 before:transition-opacity " +
  "checked:border-fir checked:before:opacity-100 hover:not-checked:border-ink-soft " +
  // Forced colours (Windows high contrast) repaint backgrounds: draw the dot in text colour.
  "forced-colors:before:bg-[CanvasText]";

export function ExportManager() {
  const [profile, setProfile] = useState<string>(PROFILES[0].id);
  const [options, setOptions] = useState<Record<OptionId, boolean>>({
    birthdays: false,
    ranks: false,
    memorial: false,
  });
  const pdf = useDownload("pdf");

  function downloadPdf() {
    const params = new URLSearchParams({ profile });
    for (const { id } of OPTIONS) if (options[id]) params.set(id, "1");
    void pdf.start(`/api/export/pdf?${params}`);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-gutter">
      <Panel
        title="Profil"
        description="Welche Teile des Verzeichnisses das PDF enthält."
        flush
        className="overflow-hidden"
      >
        <fieldset>
          <legend className="sr-only">Profil</legend>
          <div className="divide-y divide-line">
            {PROFILES.map((p) => (
              <label key={p.id} className={ROW}>
                <input
                  type="radio"
                  name="profile"
                  value={p.id}
                  checked={profile === p.id}
                  onChange={() => setProfile(p.id)}
                  aria-describedby={`profile-${p.id}-hint`}
                  className={RADIO}
                />
                <span className="min-w-0">
                  <span className="block text-ui font-medium text-ink">{p.label}</span>
                  <span id={`profile-${p.id}-hint`} className="block text-caption text-ink-faint">
                    {p.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Panel>

      <Panel title="Optionen" flush className="overflow-hidden">
        <div className="divide-y divide-line">
          {OPTIONS.map((o) => (
            <label key={o.id} className={`${ROW} items-center text-ui text-ink`}>
              <Checkbox
                checked={options[o.id]}
                onCheckedChange={(v) => setOptions((prev) => ({ ...prev, [o.id]: v === true }))}
              />
              {o.label}
            </label>
          ))}
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* aria-disabled instead of disabled: a disabled button would drop keyboard focus
            while the PDF is generated. pdf.start ignores clicks while pending. */}
        <Button onClick={downloadPdf} aria-disabled={pdf.pending}>
          {pdf.pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
          {pdf.pending ? "PDF wird erzeugt …" : "PDF erzeugen"}
        </Button>
        <span className="text-caption text-ink-faint">Die Erzeugung kann einige Sekunden dauern.</span>
      </div>

      <p className="border-t border-line pt-gutter text-caption text-ink-soft">
        CSV: im{" "}
        <Link href="/" className={LINK}>
          Verzeichnis
        </Link>{" "}
        Personen auswählen oder im{" "}
        <Link href="/verteiler" className={LINK}>
          Verteiler
        </Link>{" "}
        herunterladen.
      </p>
    </div>
  );
}
