import { headers } from "next/headers";

import { logout } from "@/actions/auth";
import { auth } from "@/lib/auth";

// Placeholder home of the protected area — replaced by the person directory in M3.
export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  const displayName = session?.user.name || session?.user.email || "";

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-ink-faint">
            Deutscher Pfadfinderbund
          </p>
          <p className="font-display text-lg font-semibold text-ink">
            Anschriftenverzeichnis
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-ink-soft">{displayName}</span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-ink transition-colors hover:bg-surface-2"
            >
              Abmelden
            </button>
          </form>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold text-ink">
            Verzeichnis
          </h1>
          <p className="mt-3 text-sm text-ink-soft">
            Die Personentabelle folgt in einem der nächsten Schritte.
          </p>
        </div>
      </main>
    </div>
  );
}
