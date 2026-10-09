import type { Metadata } from "next";

import { StandaloneCard } from "@/components/standalone-card";

import { LoginButton } from "./login-button";
import { LOGIN_FAILED } from "./messages";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <StandaloneCard title="Anschriftenverzeichnis">
      {error === "access_denied" ? (
        <div role="alert" className="mb-6 rounded-md border border-crit/40 bg-crit-tint p-4 text-ui">
          <p className="font-medium text-ink">Kein Zugriff</p>
          <p className="mt-1 text-ink-soft">
            Dein Konto hat keine Berechtigung für das Anschriftenverzeichnis. Wende dich an die
            Bundeskanzlei.
          </p>
        </div>
      ) : error ? (
        <p role="alert" className="mb-6 rounded-md border border-crit/40 bg-crit-tint p-4 text-ui text-ink">
          {LOGIN_FAILED}
        </p>
      ) : null}

      <LoginButton />
    </StandaloneCard>
  );
}
