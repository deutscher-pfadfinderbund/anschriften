import { cn } from "@/lib/utils";

/**
 * The app's one card: a bordered surface (no shadow — calm, like a printed
 * page) with a display-serif h2 header. Use it for every boxed section. Without
 * children only the header shows (a collapsed section).
 */
export function Panel({
  title,
  description,
  actions,
  flush = false,
  className,
  children,
}: {
  /** Section heading, rendered as an h2 (may hold a disclosure button). */
  title: React.ReactNode;
  /** One quiet line under the title (what the section is for, or a hint). */
  description?: React.ReactNode;
  /** Controls on the right of the header (wrap below the title on phones). */
  actions?: React.ReactNode;
  /** No body padding — for lists and tables that run edge to edge. */
  flush?: boolean;
  /** Extra classes on the outer <section> (e.g. grid placement). */
  className?: string;
  children?: React.ReactNode;
}) {
  const body = children != null && children !== false;
  return (
    <section className={cn("min-w-0 rounded-lg border border-line bg-surface", className)}>
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-gutter",
          body && "border-b border-line",
        )}
      >
        <div className="min-w-0">
          <h2 className="font-display text-panel font-semibold text-ink">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-caption text-ink-faint">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {body ? <div className={cn(!flush && "p-4 sm:p-gutter")}>{children}</div> : null}
    </section>
  );
}
