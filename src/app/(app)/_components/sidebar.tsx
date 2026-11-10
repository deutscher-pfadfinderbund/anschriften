"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Building2,
  FileDown,
  History,
  LogOut,
  Mails,
  Tags,
} from "lucide-react";

import { logout } from "@/actions/auth";
import { Schriftzug } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_ROW, QUIET_ACTION, TOUCH_HIT, cn } from "@/lib/utils";

type NavEntry = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const MAIN_NAV: NavEntry[] = [
  { href: "/", label: "Verzeichnis", icon: BookOpen },
  { href: "/verteiler", label: "Verteiler", icon: Mails },
  { href: "/export", label: "PDF-Export", icon: FileDown },
  { href: "/protokoll", label: "Änderungsprotokoll", icon: History },
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

/**
 * The app name in the display serif, on one line: at text-panel it fits the rail
 * (w-60 minus px-5). The soft hyphen is the fallback should it ever be too wide.
 */
export function Wordmark() {
  return (
    <div className="min-w-0 font-display text-panel leading-tight font-semibold text-ink">
      Anschriften&shy;verzeichnis
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
        NAV_ROW.base,
        // Thumb-friendly rows wherever the primary pointer is a finger — keyed on
        // the input mode, not on "is inside the drawer", so a touch laptop gets
        // them in the desktop rail too. A mouse keeps py-2 at every width.
        "gap-2.5 pointer-coarse:py-3",
        active ? NAV_ROW.active : NAV_ROW.idle,
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
  // A person page belongs to the directory, so "Verzeichnis" stays marked there.
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/" || pathname.startsWith("/personen")
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* The letterhead's lettering over the app name, on one left edge with the nav icons. */}
      <div className="border-b border-line px-5 pt-6 pb-4">
        <Schriftzug className="mb-2.5 w-44" />
        <Wordmark />
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
        <p className="eyebrow px-2.5 pt-4 pb-1.5">Stammdaten</p>
        {MASTER_NAV.map((entry) => (
          <NavItem
            key={entry.href}
            entry={entry}
            active={isActive(entry.href)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="border-t border-line px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-full border border-line-strong bg-surface text-micro font-semibold text-ink-soft"
          >
            {initials(userName)}
          </div>
          <div className="min-w-0 truncate text-caption font-medium text-ink">{userName}</div>
        </div>
        <div className="mt-2.5 flex items-center gap-6">
          <form action={logout} className="flex">
            <button type="submit" className={cn(TOUCH_HIT, QUIET_ACTION)}>
              <LogOut aria-hidden className="size-3" />
              Abmelden
            </button>
          </form>
          <ThemeToggle />
        </div>
      </div>
    </>
  );
}

/** Desktop rail. Below `lg` the same content is reachable through the drawer. */
export function Sidebar({ userName }: { userName: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-paper lg:flex">
      <SidebarContent userName={userName} />
    </aside>
  );
}
