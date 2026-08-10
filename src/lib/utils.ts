import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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
