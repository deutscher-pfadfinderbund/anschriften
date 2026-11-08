"use client";

// Global error boundary. Catches unexpected errors thrown while rendering pages
// (e.g. an unreachable database) so the user
// sees a calm German screen instead of Next's English crash page — and keeps a
// path back into the app.
import Link from "next/link";

import { StandaloneCard } from "@/components/standalone-card";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <StandaloneCard title="Etwas ist schiefgelaufen" className="text-center">
      <p>
        Die Seite konnte gerade nicht geladen werden oder die letzte Aktion ist fehlgeschlagen.
        Versuche es einfach noch einmal. Hilft das nicht, melde dich bitte neu an.
      </p>
      {error.digest ? (
        <p className="mt-2 text-caption text-ink-faint">Fehlerkennung: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-col gap-2">
        <Button size="lg" onClick={() => unstable_retry()}>
          Noch einmal versuchen
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link href="/login">Neu anmelden</Link>
        </Button>
      </div>
    </StandaloneCard>
  );
}
