// Client-side file download for the export route handlers (PDF, CSV). One implementation for
// every download button: fetch + blob keeps the user on the page, lets a failure surface as a
// toast instead of a bare error page, and — crucially — never saves an error or login page
// under a .pdf/.csv name.
import { useState } from "react";
import { toast } from "sonner";

/** The session cookie is gone or invalid: the route answered 401 (or something redirected). */
export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
    this.name = "SessionExpiredError";
  }
}

/** The export target no longer exists (HTTP 404); the message is the server's German text. */
export class GoneError extends Error {}

/**
 * Filename from a Content-Disposition header (`filename="…"` or bare), null when absent.
 * Our export routes only send ASCII names, so the RFC 5987 `filename*` form is not needed.
 */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header);
  const name = (plain?.[1] ?? plain?.[2] ?? "").trim();
  return name || null;
}

/**
 * Fetch `url` and save the response as a file. Throws `SessionExpiredError` on 401 or when
 * the request was redirected (a redirect can only lead to the login page), and a plain
 * Error for any other non-2xx answer. `fallbackName` is used when the response names no file.
 */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (res.redirected || res.status === 401) throw new SessionExpiredError();
  // 404 from an export route (plain German text): the thing to export is gone, e.g. a list
  // deleted in another tab — retrying won't help. Any other 404 (HTML) is a plain failure.
  if (res.status === 404 && res.headers.get("Content-Type")?.startsWith("text/plain"))
    throw new GoneError(await res.text());
  if (!res.ok) throw new Error(`Download failed with HTTP ${res.status}`);
  const blob = await res.blob();
  const filename = filenameFromDisposition(res.headers.get("Content-Disposition")) ?? fallbackName;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the browser has picked the blob up before it goes away.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

type DownloadKind = "csv" | "pdf";
const DOWNLOADS: Record<DownloadKind, { fallbackName: string; failure: string }> = {
  csv: { fallbackName: "anschriften.csv", failure: "CSV-Export fehlgeschlagen." },
  pdf: { fallbackName: "anschriftenverzeichnis.pdf", failure: "PDF konnte nicht erzeugt werden." },
};

/**
 * Excel opens a double-clicked CSV with "General" columns and strips the leading zero of a
 * PLZ like 01067 (a Word mail merge reads it as text and is fine). Shown with the first CSV
 * download in this browser only, so it does not nag on every export.
 */
const CSV_EXCEL_HINT =
  "Für Excel: über Daten → Aus Text/CSV öffnen und die PLZ-Spalte als Text einstellen, sonst fehlt bei PLZ wie 01067 die führende Null.";
const CSV_HINT_SEEN = "csv-excel-hint-seen";

function firstTime(key: string): boolean {
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
  } catch {
    // Storage blocked: show the hint (harmless if repeated).
  }
  return true;
}

/**
 * A download button: `start(url)` saves the file and toasts the outcome; clicks while
 * `pending` are ignored. An expired session gets its own toast with "Neu anmelden" (the
 * generic "bitte versuche es noch einmal" would just fail again).
 */
export function useDownload(kind: DownloadKind) {
  const [pending, setPending] = useState(false);
  async function start(url: string) {
    if (pending) return;
    setPending(true);
    try {
      await downloadFile(url, DOWNLOADS[kind].fallbackName);
      const hint = kind === "csv" && firstTime(CSV_HINT_SEEN);
      toast.success(
        `${kind.toUpperCase()} heruntergeladen.`,
        hint ? { description: CSV_EXCEL_HINT, duration: 15_000 } : undefined,
      );
    } catch (err) {
      if (err instanceof SessionExpiredError)
        toast.error("Deine Sitzung ist abgelaufen – bitte neu anmelden.", {
          // Stays until acted on or closed, so keyboard users can reach the action.
          duration: Infinity,
          closeButton: true,
          action: { label: "Neu anmelden", onClick: () => window.location.assign("/login") },
        });
      else if (err instanceof GoneError) toast.error(`${err.message} Bitte lade die Seite neu.`);
      else toast.error(`${DOWNLOADS[kind].failure} Bitte versuche es noch einmal.`);
    } finally {
      setPending(false);
    }
  }
  return { pending, start };
}
