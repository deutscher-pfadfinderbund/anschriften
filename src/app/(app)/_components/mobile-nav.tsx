"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { SidebarContent, Wordmark } from "./sidebar";

/**
 * Top bar for viewports below `lg`, where the desktop rail is hidden. The
 * hamburger opens the same navigation as the dialog's left drawer. Escape and a
 * tap on the overlay close it; tapping a nav link closes it too, so the target
 * page is not left covered. Its height is --top-bar (globals.css), which toasts
 * and sticky elements keep clear of.
 */
export function MobileNav({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-(--top-bar) shrink-0 items-center justify-between gap-3 border-b border-line bg-surface-2 pr-1.5 pl-4 lg:hidden">
      <Wordmark />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="Menü öffnen"
            className="grid size-11 shrink-0 place-items-center rounded-md text-ink-soft transition-colors hover:bg-hover hover:text-ink"
          >
            <Menu className="size-5" />
          </button>
        </DialogTrigger>
        <DialogContent
          side="left"
          aria-describedby={undefined}
          // Radix would focus the first non-link control — "Abmelden". Start on
          // the current page's entry instead, so Enter cannot log out by accident.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const drawer = event.currentTarget as HTMLElement;
            (
              drawer.querySelector<HTMLElement>('nav a[aria-current="page"]') ??
              drawer.querySelector<HTMLElement>("nav a")
            )?.focus();
          }}
        >
          {/* The drawer repeats the wordmark, so a visible title would be noise. */}
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <SidebarContent userName={userName} onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </header>
  );
}
