"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { QUIET_ACTION, TOUCH_HIT, cn } from "@/lib/utils";

// The viewer's light/dark choice, as in the Bundesarchiv: the "theme" cookie.
// The root layout renders it as <html data-theme>, so a saved choice paints from
// the first frame; without one the page follows the system.
const COOKIE = "theme";
const SYSTEM_DARK = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const system = matchMedia(SYSTEM_DARK);
  system.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  return () => {
    system.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

function isDark(): boolean {
  const saved = document.documentElement.dataset.theme;
  return saved ? saved === "dark" : matchMedia(SYSTEM_DARK).matches;
}

/** Whether the page shows dark; null on the server (the system is unknown there). */
function useIsDark(): boolean | null {
  return useSyncExternalStore(subscribe, isDark, () => null);
}

/**
 * Every click flips what the page shows. A choice equal to the system's deletes
 * the cookie, so the page follows the system again.
 */
function toggle() {
  const next = isDark() ? "light" : "dark";
  const root = document.documentElement;
  if (next === (matchMedia(SYSTEM_DARK).matches ? "dark" : "light")) {
    delete root.dataset.theme;
    document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`;
  } else {
    root.dataset.theme = next;
    document.cookie = `${COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }
}

/** Text button switching between the light and the dark view. */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useIsDark();
  const label = dark ? "Helle Ansicht" : "Dunkle Ansicht";
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggle}
      // The scheme is only known after hydration: no wrong label before it.
      className={cn(TOUCH_HIT, QUIET_ACTION, dark === null && "invisible", className)}
    >
      <Icon aria-hidden className="size-3" />
      {label}
    </button>
  );
}
