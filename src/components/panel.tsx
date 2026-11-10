import { cn } from "@/lib/utils";

/**
 * The app's one section: no box — a display-serif h2 over an ink rule, then the
 * content on the page itself. Use it for every section of a page.
 */
export function Panel({
  title,
  description,
  actions,
  flush = false,
  className,
  children,
}: {
  /** Section heading, rendered as an h2. */
  title: string;
  /** One quiet line under the title (what the section is for, or a hint). */
  description?: React.ReactNode;
  /** Controls on the right of the header (wrap below the title on phones). */
  actions?: React.ReactNode;
  /** No space under the rule — for lists whose rows bring their own rules. */
  flush?: boolean;
  /** Extra classes on the outer <section> (e.g. grid placement). */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // pt-4: more space above a section title than below it, also between stacked sections.
    <section className={cn("min-w-0 pt-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-b border-ink pb-2.5">
        <div className="min-w-0">
          <h2 className="font-display text-section font-semibold text-ink">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-caption text-ink-faint">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className={cn(!flush && "pt-4")}>{children}</div>
    </section>
  );
}
