"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function LoginButton() {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    const { error } = await authClient.signIn.oauth2({
      providerId: "keycloak",
      callbackURL: "/",
      errorCallbackURL: "/login",
    });
    // On success the client redirects the browser to Keycloak, so we only reach
    // here if kicking off the flow itself failed.
    if (error) {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={pending}
      className="w-full rounded-md bg-fir px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-fir-deep disabled:opacity-60"
    >
      {pending ? "Weiterleitung …" : "Anmelden mit DPB-Login"}
    </button>
  );
}
