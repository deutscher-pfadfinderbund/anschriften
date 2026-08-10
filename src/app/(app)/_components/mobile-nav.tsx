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
 * hamburger opens the same navigation as a left-anchored, full-height drawer —
 * built from the shared Dialog primitive with call-site class overrides rather
 * than a second primitive. Escape and a tap on the overlay close it; tapping a
 * nav link closes it too, so the target page is not left covered.
 */
export function MobileNav({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface-2 pr-1.5 pl-4 lg:hidden">
      <Wordmark className="min-w-0 truncate text-[17px]" />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="Menü öffnen"
            className="grid size-11 shrink-0 place-items-center rounded-md text-ink-soft outline-none transition-colors hover:bg-sel hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Menu className="size-5" />
          </button>
        </DialogTrigger>
        {/* Left-anchored, full-height variant of the shared dialog. The nav rows
            size themselves (see NavItem in sidebar.tsx) — nothing here reaches
            into the shared SidebarContent. */}
        <DialogContent
          aria-describedby={undefined}
          // max-h-none/overflow-hidden opt out of DialogContent's viewport cap:
          // the drawer is meant to be exactly full height and scrolls inside its
          // own <nav>, so the shared max-h would leave a 2rem gap at the bottom.
          className="top-0 left-0 flex h-dvh max-h-none w-72 max-w-[85vw] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-r border-line bg-surface-2 p-0 ring-0 data-open:zoom-in-100 data-open:slide-in-from-left data-closed:zoom-out-100 data-closed:slide-out-to-left"
        >
          {/* The drawer repeats the wordmark, so a visible title would be noise. */}
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <SidebarContent userName={userName} onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </header>
  );
}
