import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Shared topbar: display-serif title with an optional subtitle and back link. */
export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  actions,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b border-line px-6 pt-5 pb-4">
      {backHref ? (
        <Link
          href={backHref}
          // The link is only ~19px tall; on touch it gets an invisible band so
          // it is comfortably tappable (same trick as the checkbox labels).
          className="relative mb-2 inline-flex items-center gap-1 text-[12.5px] text-ink-soft transition-colors hover:text-fir pointer-coarse:after:absolute pointer-coarse:after:-inset-x-3 pointer-coarse:after:-inset-y-2"
        >
          <ArrowLeft className="size-3.5" />
          {backLabel ?? "Zurück"}
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-balance text-ink">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-[13px] text-ink-soft">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
