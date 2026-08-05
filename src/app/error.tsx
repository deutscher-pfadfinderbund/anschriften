"use client";

// Global error boundary. Catches errors thrown by Server Actions and pages
// (e.g. an expired session in requireSession, or a database error) so the user
// sees a calm German screen instead of Next's English crash page — and keeps a
// path back into the app without losing their place entirely.
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 shadow-sm">
        <p className="text-[11px] uppercase tracking-widest text-ink-faint">
          Anschriftenverzeichnis
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
          Etwas ist schiefgelaufen
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          Die Aktion konnte nicht abgeschlossen werden. Möglicherweise ist Ihre Sitzung
          abgelaufen — bitte melden Sie sich neu an. Andernfalls versuchen Sie es bitte
          noch einmal.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-ink-faint">Fehlerkennung: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <Button onClick={() => reset()}>Erneut versuchen</Button>
          <Button variant="outline" asChild>
            <Link href="/login">Neu anmelden</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
