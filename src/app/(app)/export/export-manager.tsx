"use client";

// Interactive PDF export form (issue #5): pick one of five profiles, toggle the print
// options and download the generated directory. A calm radio list, plain checkbox rows
// and one primary button; fir only for the checked dot and that button.
import { useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { downloadFile, toastDownloadError } from "@/lib/download";
import { LINK } from "@/lib/utils";

const PROFILES = [
  { id: "komplett", label: "Komplett", hint: "Alle Gliederungen mit Orden und Bundesgilde" },
  { id: "nurBundesaemter", label: "Bundesämter", hint: "Bund, Jungenbund und Mädchenbund – ohne Älterengemeinschaften" },
  { id: "nurBundesgilde", label: "Bundesgilde", hint: "Nur die Bundesgilde" },
  { id: "nurOrdenStGeorg", label: "Orden St. Georg", hint: "Nur der Orden St. Georg" },
  { id: "nurOrdenStChristophorus", label: "Orden St. Christophorus", hint: "Nur der Orden St. Christophorus" },
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
  const [pending, setPending] = useState(false);

  // Fetch + blob so a Typst failure surfaces as a toast instead of navigating away to a
  // bare error page, and so double-clicks can't start parallel runs.
  async function downloadPdf() {
    if (pending) return;
    const params = new URLSearchParams({ profile });
    for (const { id } of OPTIONS) if (options[id]) params.set(id, "1");
    setPending(true);
    try {
      await downloadFile(`/api/export/pdf?${params}`, "anschriftenverzeichnis.pdf");
      toast.success("PDF heruntergeladen.");
    } catch (err) {
      toastDownloadError(err, "PDF konnte nicht erzeugt werden. Bitte versuche es noch einmal.");
    } finally {
      setPending(false);
    }
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
            while the PDF is generated. downloadPdf ignores clicks while pending. */}
        <Button onClick={downloadPdf} aria-disabled={pending} className="aria-disabled:opacity-60">
          {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
          {pending ? "PDF wird erzeugt …" : "PDF erzeugen"}
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
