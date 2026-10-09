import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { TOUCH_HIT, cn } from "@/lib/utils";

/**
 * Page gutter shared by PageHeader and PageBody: 16px on phones (aligned with
 * the mobile top bar), 24px from `sm` up.
 */
const PAGE_GUTTER = "px-4 sm:px-6";

/** Shared topbar: display-serif title with an optional subtitle, back link and actions. */
export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  actions,
}: {
  /** Page title (h1, display serif). */
  title: string;
  /** One quiet line under the title (counts, context). */
  subtitle?: string;
  /** Renders a "← back" link above the title. */
  backHref?: string;
  /** Text of the back link; defaults to "Zurück". */
  backLabel?: string;
  /** Page-level actions, top right (the primary "create" action goes here). */
  actions?: React.ReactNode;
}) {
  return (
    <header className={cn(PAGE_GUTTER, "border-b border-line pt-5 pb-4")}>
      {backHref ? (
        <Link
          href={backHref}
          className={cn(
            TOUCH_HIT,
            "mb-2 inline-flex items-center gap-1 rounded-sm text-caption text-ink-soft transition-colors hover:text-fir",
          )}
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          {backLabel ?? "Zurück"}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-display text-title font-semibold text-balance text-ink">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-ui text-ink-soft">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/** Body wrapper under a PageHeader: the same gutter, plus the shared top/bottom rhythm. */
export function PageBody({
  className,
  children,
}: {
  /** Extra classes, e.g. a max width or a flex/grid layout. */
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn(PAGE_GUTTER, "pt-gutter pb-10", className)}>{children}</div>;
}
