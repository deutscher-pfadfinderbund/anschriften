import { LoginButton } from "./login-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-8 text-center">
          <p className="text-[11px] uppercase tracking-widest text-ink-faint">
            Deutscher Pfadfinderbund
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
            Anschriftenverzeichnis
          </h1>
        </div>

        {error ? (
          <div className="mb-6 rounded-md border border-crit/40 bg-crit-tint p-4 text-sm text-ink">
            <p className="font-medium">Kein Zugriff</p>
            <p className="mt-1 text-ink-soft">
              Dein Konto hat keine Berechtigung für das Anschriftenverzeichnis.
              Wende dich an die Bundeskanzlei.
            </p>
          </div>
        ) : null}

        <LoginButton />
      </div>
    </main>
  );
}
