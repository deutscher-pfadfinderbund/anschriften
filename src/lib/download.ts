// Client-side file download for the export route handlers (PDF, CSV). One implementation for
// every download button: fetch + blob keeps the user on the page, lets a failure surface as a
// toast instead of a bare error page, and — crucially — never saves an error or login page
// under a .pdf/.csv name.
import { toast } from "sonner";

/** The session cookie is gone or invalid: the route answered 401 (or something redirected). */
export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
    this.name = "SessionExpiredError";
  }
}

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

/**
 * The toast for a failed `downloadFile`: an expired session gets its own message with a
 * "Neu anmelden" action (the generic "bitte versuche es noch einmal" would just fail again);
 * everything else shows `genericMessage`.
 */
export function toastDownloadError(err: unknown, genericMessage: string): void {
  if (err instanceof SessionExpiredError) {
    toast.error("Deine Sitzung ist abgelaufen – bitte neu anmelden.", {
      // Stays until acted on or closed, so keyboard users can reach the action.
      duration: Infinity,
      closeButton: true,
      action: {
        label: "Neu anmelden",
        onClick: () => {
          window.location.href = "/login";
        },
      },
    });
    return;
  }
  toast.error(genericMessage);
}
