import { Lilie } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Centered column for the pages outside the app shell (login, 404, error): the
 * Lilie and a serif title, then the page's own content. No box, like the panels.
 * Renders the page's <main>, or a <div> inside the shell's.
 */
export function StandaloneCard({
  title,
  className,
  inShell = false,
  children,
}: {
  /** Page title (h1, display serif). */
  title: string;
  /** Extra classes on the content (e.g. text alignment). */
  className?: string;
  /** Inside the app shell: a <div> (the shell has the <main> landmark and the
   * sidebar's theme switch). Outside it: the page's <main> with the switch. */
  inShell?: boolean;
  children: React.ReactNode;
}) {
  const Root = inShell ? "div" : "main";
  return (
    <Root className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Lilie className="mb-5 h-16" />
          <h1 className="font-display text-title font-semibold text-balance text-ink">
            {title}
          </h1>
        </div>
        <div className={cn("text-body text-ink-soft", className)}>{children}</div>
        {inShell ? null : (
          <div className="mt-8 text-center">
            <ThemeToggle />
          </div>
        )}
      </div>
    </Root>
  );
}
