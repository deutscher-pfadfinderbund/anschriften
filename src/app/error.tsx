"use client";

// Global error boundary. Catches errors thrown by Server Actions and pages
// (e.g. an expired session in requireSession, or a database error) so the user
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
        Die Aktion konnte nicht abgeschlossen werden. Vielleicht ist deine Sitzung abgelaufen —
        dann melde dich bitte neu an. Sonst versuche es einfach noch einmal.
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
