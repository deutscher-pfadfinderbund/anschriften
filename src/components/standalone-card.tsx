import { BundEyebrow, Raute } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Centered card for the pages outside the app shell (login, 404, error): the
 * brand lozenge, the "Deutscher Pfadfinderbund" eyebrow and a serif title, then
 * the page's own content. Renders the page's <main>, or a <div> inside the shell's.
 */
export function StandaloneCard({
  title,
  className,
  inShell = false,
  children,
}: {
  /** Page title (h1, display serif). */
  title: string;
  /** Extra classes on the card body (e.g. text alignment). */
  className?: string;
  /** Inside the app shell: a <div> (the shell has the <main> landmark and the
   * sidebar's theme switch). Outside it: the page's <main> with the switch. */
  inShell?: boolean;
  children: React.ReactNode;
}) {
  const Root = inShell ? "div" : "main";
  return (
    <Root className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface px-6 py-8 sm:px-8">
        <div className="mb-6 text-center">
          <Raute className="mx-auto mb-4 block size-[11px]" />
          <BundEyebrow />
          <h1 className="mt-1 font-display text-title font-semibold text-balance text-ink">
            {title}
          </h1>
        </div>
        <div className={cn("text-body text-ink-soft", className)}>{children}</div>
        {inShell ? null : (
          <div className="mt-6 text-center">
            <ThemeToggle />
          </div>
        )}
      </div>
    </Root>
  );
}
