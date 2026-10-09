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
import { TOUCH_HIT, cn } from "@/lib/utils";

type NavEntry = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const MAIN_NAV: NavEntry[] = [
  { href: "/", label: "Verzeichnis", icon: BookOpen },
  { href: "/verteiler", label: "Verteiler", icon: Mails },
  { href: "/export", label: "PDF-Export", icon: FileDown },
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
export function Wordmark() {
  return (
    <div className="flex min-w-0 items-center font-display text-[18px] leading-tight font-semibold text-ink">
      {/* shrink-0: the lozenge is the brand mark and must never be squeezed
          to 0px by a long name. */}
      <span aria-hidden className="mr-[7px] inline-block size-[9px] shrink-0 -translate-y-px rotate-45 bg-fir" />
      {/* Soft hyphen: if a wide fallback serif does not fit, the name breaks
          as „Anschriften-/verzeichnis“ instead of overflowing its box. */}
      <span className="min-w-0">Anschriften&shy;verzeichnis</span>
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
        "relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-ui transition-colors",
        // Thumb-friendly rows wherever the primary pointer is a finger — keyed on
        // the input mode, not on "is inside the drawer", so a touch laptop gets
        // them in the desktop rail too. A mouse keeps py-2 at every width.
        "pointer-coarse:py-3",
        // One "active" language app-wide: --active fill (always stronger than
        // --hover), fir text and a straight fir marker bar.
        active
          ? "bg-active font-medium text-fir before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-fir"
          : "text-ink-soft hover:bg-hover hover:text-ink",
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
      <div className="border-b border-line px-5 pt-5 pb-4">
        <p className="eyebrow mb-1">Deutscher Pfadfinderbund</p>
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

      <div className="flex items-center gap-2.5 border-t border-line px-4 py-3.5">
        {/* Neutral on purpose: the avatar is neither a link nor an active marker. */}
        <div
          aria-hidden
          className="grid size-[30px] shrink-0 place-items-center rounded-full border border-line-strong bg-surface text-micro font-semibold text-ink-soft"
        >
          {initials(userName)}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-caption font-medium text-ink">{userName}</div>
          <form action={logout}>
            <button
              type="submit"
              className={cn(
                TOUCH_HIT,
                "inline-flex items-center gap-1 rounded-sm text-micro text-ink-soft transition-colors hover:text-ink",
              )}
            >
              <LogOut aria-hidden className="size-3" />
              Abmelden
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

/** Desktop rail. Below `lg` the same content is reachable through the drawer. */
export function Sidebar({ userName }: { userName: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface-2 lg:flex">
      <SidebarContent userName={userName} />
    </aside>
  );
}
