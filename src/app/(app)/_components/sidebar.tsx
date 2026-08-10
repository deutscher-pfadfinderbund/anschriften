"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Building2,
  FileDown,
  LogOut,
  Mails,
  Tags,
} from "lucide-react";

import { logout } from "@/actions/auth";
import { cn } from "@/lib/utils";

type NavEntry = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const MAIN_NAV: NavEntry[] = [
  { href: "/", label: "Verzeichnis", icon: BookOpen },
  { href: "/verteiler", label: "Verteiler", icon: Mails },
  { href: "/export", label: "PDF & Export", icon: FileDown },
];

const MASTER_NAV: NavEntry[] = [
  { href: "/gliederungen", label: "Gliederungen", icon: Building2 },
  { href: "/stammdaten", label: "Ämter & Stände", icon: Tags },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Fir lozenge + app name. Shared by the sidebar header and the mobile top bar. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center font-display font-semibold text-ink",
        className,
        // Must stay AFTER `className`: callers pass a font size (text-[19px] in the
        // rail, text-[17px] in the mobile top bar) and tailwind-merge treats a
        // font-size utility as overriding `leading-*`. In the base string the
        // leading would be dropped from the merge and the wordmark would inherit
        // the body line-height instead of 1.25.
        "leading-tight",
      )}
    >
      <span className="mr-[7px] inline-block size-[9px] -translate-y-px rotate-45 bg-fir" />
      Anschriftenverzeichnis
    </div>
  );
}

function NavItem({
  entry,
  active,
  onNavigate,
}: {
  entry: NavEntry;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = entry.icon;
  return (
    <Link
      href={entry.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        // pl-2 plus the 2px marker border keeps the label on the same x as px-2.5.
        "flex w-full items-center gap-2.5 rounded-md border-l-2 py-2 pr-2.5 pl-2 text-[13.5px] transition-colors",
        // Thumb-friendly rows wherever the primary pointer is a finger — keyed on
        // the input mode, not on "is inside the drawer", so a touch laptop gets
        // them in the desktop rail too. A mouse keeps py-2 at every width.
        "pointer-coarse:py-3",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // One "active" language app-wide: neutral surface, fir marker, fir text.
        active
          ? "border-fir bg-surface font-medium text-fir"
          : "border-transparent text-ink-soft hover:bg-sel hover:text-ink",
      )}
    >
      <Icon className="size-[15px] shrink-0 opacity-80" />
      {entry.label}
    </Link>
  );
}

/**
 * Wordmark + navigation + user footer. Lives here exactly once and is rendered
 * both by the desktop <aside> below and by the mobile drawer (mobile-nav.tsx),
 * so both share the same entries and the same active-state language.
 * `onNavigate` lets the drawer close itself when a link is tapped.
 */
export function SidebarContent({
  userName,
  onNavigate,
}: {
  userName: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <div className="border-b border-line px-5 pt-[22px] pb-[18px]">
        <div className="mb-1 text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
          Deutscher Pfadfinderbund
        </div>
        <Wordmark className="text-[19px]" />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-3.5">
        {MAIN_NAV.map((entry) => (
          <NavItem
            key={entry.href}
            entry={entry}
            active={isActive(entry.href)}
            onNavigate={onNavigate}
          />
        ))}
        <div className="px-2.5 pt-3.5 pb-1.5 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
          Stammdaten
        </div>
        {MASTER_NAV.map((entry) => (
          <NavItem
            key={entry.href}
            entry={entry}
            active={isActive(entry.href)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-line px-4 py-3.5">
        <div className="grid size-[30px] place-items-center rounded-full bg-fir text-xs font-semibold text-on-fir">
          {initials(userName)}
        </div>
        <div className="min-w-0 flex-1 text-xs leading-tight">
          <div className="truncate font-medium text-ink">{userName}</div>
          <div className="text-[11px] text-ink-faint">via Keycloak</div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            title="Abmelden"
            aria-label="Abmelden"
            className="rounded-md p-1.5 text-ink-faint outline-none transition-colors hover:bg-sel hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </>
  );
}

/** Desktop rail. Below `lg` the same content is reachable through the drawer. */
export function Sidebar({ userName }: { userName: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-58 shrink-0 flex-col border-r border-line bg-surface-2 lg:flex">
      <SidebarContent userName={userName} />
    </aside>
  );
}
