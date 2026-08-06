// German 404 page. Shown when a route (e.g. a person id that no longer exists)
// cannot be found, in place of Next's default English screen.
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 shadow-sm">
        <p className="text-[11px] uppercase tracking-widest text-ink-faint">
          Anschriftenverzeichnis
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
          Seite nicht gefunden
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          Diese Seite oder dieser Eintrag existiert nicht (mehr). Möglicherweise wurde er
          gelöscht oder der Link ist nicht korrekt.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link href="/">Zurück zum Verzeichnis</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
