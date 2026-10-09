import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

import { fold } from "@/lib/format"

// Teach tailwind-merge the custom type scale and spacing from globals.css.
// Without it `text-caption` would be taken for a text *color* and silently
// drop a `text-ink` next to it (and vice versa).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "caption", "ui", "body", "panel", "title"],
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
 * Vertical-only variant of {@link TOUCH_HIT} for controls that sit flush against
 * each other (e.g. the two separator toggles): a horizontal inset would make
 * their hit areas overlap.
 */
export const TOUCH_HIT_Y =
  "pointer-coarse:relative pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2"

/**
 * Row actions that fade in on hover. Keyed on the input mode, not on width: a
 * touch device has no :hover at any viewport size, so the actions stay visible
 * there — only a fine pointer (mouse) gets the dense hover-reveal. Requires the
 * row to carry `group/row`; `:focus-within` on that group also covers the
 * buttons' own focus, so they stay visible while tabbed to.
 */
export const HOVER_REVEAL =
  "opacity-100 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100"
