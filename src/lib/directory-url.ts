// The directory keeps its search and filters in the URL. Pages that lead back to it
// (the person editor) return to the last visited directory URL, so the user lands on
// the same filtered list instead of a reset one. Client-only: call from event
// handlers or effects, never during render (sessionStorage does not exist on the server).
const KEY = "anschriften:directory-url";

/** Remember the current directory URL (path + query). */
export function rememberDirectoryUrl(url: string): void {
  try {
    sessionStorage.setItem(KEY, url);
  } catch {
    // Storage unavailable (private mode, disabled): falling back to "/" is fine.
  }
}

/** Last remembered directory URL, or "/" when none (or not a same-origin path). */
export function directoryUrl(): string {
  try {
    const url = sessionStorage.getItem(KEY);
    return url && url.startsWith("/") && !url.startsWith("//") ? url : "/";
  } catch {
    return "/";
  }
}
