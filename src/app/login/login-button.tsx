"use client";

import { useState } from "react";

import { Note } from "@/components/note";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

import { LOGIN_FAILED } from "./messages";

export function LoginButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    try {
      const { error } = await authClient.signIn.oauth2({
        providerId: "keycloak",
        callbackURL: "/",
        errorCallbackURL: "/login",
      });
      // On success the client redirects the browser to Keycloak, so we only get
      // here if kicking off the flow failed (e.g. Keycloak unreachable).
      if (!error) return;
    } catch {
      // The request itself was rejected: offline, or the server is restarting.
    }
    setPending(false);
    setFailed(true);
  }

  return (
    <>
      <Button size="lg" className="w-full" onClick={signIn} disabled={pending}>
        {pending ? "Weiterleitung …" : "Anmelden mit DPB-Login"}
      </Button>
      {failed ? (
        <Note tone="crit" role="alert" className="mt-4 p-4">
          {LOGIN_FAILED}
        </Note>
      ) : null}
    </>
  );
}
