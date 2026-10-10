import type { Metadata } from "next";

import { Note } from "@/components/note";
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
        <Note tone="crit" role="alert" className="mb-6 p-4">
          <p className="font-medium text-ink">Kein Zugriff</p>
          <p className="mt-1 text-ink-soft">
            Dein Konto hat keine Berechtigung für das Anschriftenverzeichnis. Wende dich an die
            Bundeskanzlei.
          </p>
        </Note>
      ) : error ? (
        <Note tone="crit" role="alert" className="mb-6 p-4">
          {LOGIN_FAILED}
        </Note>
      ) : null}

      <LoginButton />
    </StandaloneCard>
  );
}
