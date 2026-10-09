import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

import { fold } from "@/lib/format"

// Teach tailwind-merge the custom type scale and spacing from globals.css.
// Without it `text-caption` would be taken for a text *color* and silently
// drop a `text-ink` next to it (and vice versa).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "caption", "ui", "body", "panel", "section", "title"],
      spacing: ["gutter"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Search rule shared by all pickers: umlaut-insensitive (see `fold`), and every
 * whitespace-separated query word must occur somewhere in `text`, in any order —
 * so "anna müller" finds "Müller, Anna".
 */
export function matchesQuery(text: string, query: string): boolean {
  const haystack = fold(text)
  return fold(query)
    .split(/\s+/)
    .every((word) => haystack.includes(word))
}

/**
 * The one skin for text-like form controls: Input, Textarea, SelectTrigger and
 * the Combobox trigger. Same height, a --control border (≥ 3:1), --field fill,
 * a placeholder clearly lighter than values, and a solid inset focus ring.
 * 16px text below `md` keeps iOS from zooming into a focused field.
 */
export const FIELD =
  "h-8 w-full min-w-0 rounded-lg border border-control bg-field px-2.5 text-base text-ink transition-colors outline-none md:text-body " +
  "placeholder:text-ink-faint hover:border-ink-faint " +
  "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-invalid:border-crit aria-invalid:ring-1 aria-invalid:ring-crit"

/**
 * Stretched, invisible tap band for controls that are only ~20px tall (text
 * rows, checkbox labels, inline "add" links). The ::after raises the hit area to
 * ~36px — the same trick the Checkbox primitive uses. Keyed on the input mode
 * (`@media (pointer: coarse)`), not on viewport width: nothing is emitted for a
 * mouse, so the desktop layout is byte-for-byte unchanged.
 */
export const TOUCH_HIT =
  "pointer-coarse:relative pointer-coarse:after:absolute pointer-coarse:after:-inset-x-3 pointer-coarse:after:-inset-y-2"

/**
 * Inline text link (and link-styled button) in running text: fir and underlined at
 * rest, so it is not told apart by colour alone.
 */
export const LINK =
  "text-fir underline decoration-fir/40 underline-offset-2 transition-colors hover:decoration-fir"

/**
 * A navigation row (sidebar, Verteiler rail). One "active" language app-wide: --active
 * fill (always stronger than --hover), fir text and a straight fir marker bar.
 */
export const NAV_ROW = {
  base: "relative flex w-full items-center rounded-md px-2.5 py-2 text-ui transition-colors",
  active:
    "bg-active font-medium text-fir before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-fir",
  idle: "text-ink-soft hover:bg-hover hover:text-ink",
}

/** `pathname` and query `search` with `patch` applied: a value sets its param, null or "" drops it. */
export function urlWith(pathname: string, search: string, patch: Record<string, string | null>): string {
  const params = new URLSearchParams(search)
  for (const [name, value] of Object.entries(patch)) {
    if (value) params.set(name, value)
    else params.delete(name)
  }
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/**
 * Write query params into the address bar. The native History API (documented in Next's
 * "Linking and Navigating" guide) keeps useSearchParams in sync without a navigation, so
 * the page's data is not fetched from the server again.
 */
export function replaceQuery(patch: Record<string, string | null>): void {
  window.history.replaceState(null, "", urlWith(window.location.pathname, window.location.search, patch))
}
