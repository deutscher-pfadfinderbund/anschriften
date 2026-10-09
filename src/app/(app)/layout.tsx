import { Toaster } from "@/components/ui/sonner";
import { actorName, requirePageSession } from "@/lib/auth-helpers";

import { MobileNav } from "./_components/mobile-nav";
import { Sidebar } from "./_components/sidebar";

// Shell of the protected area: skip link, navigation, <main> landmark, toasts.
// The session check here is only a fast-path redirect, NOT a security boundary
// (layouts are skipped on client-side navigations) — every page calls
// requirePageSession() itself before loading data.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requirePageSession();
  const userName = actorName(session);

  return (
    // Below `lg` the top bar stacks above the content; from `lg` up the rail
    // sits beside it.
    <div className="flex min-h-screen flex-col lg:flex-row">
      <a
        href="#inhalt"
        className="sr-only rounded-md border border-line-strong bg-surface px-3 py-2 text-ui font-medium text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Zum Inhalt springen
      </a>
      <MobileNav userName={userName} />
      <Sidebar userName={userName} />
      {/* tabIndex -1: target of the skip link and of the dialogs' focus
          fallback; it never shows a focus outline of its own. */}
      <main id="inhalt" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
