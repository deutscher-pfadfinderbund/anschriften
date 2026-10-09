"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { account } from "@/db/auth-schema";
import { getActionSession } from "@/lib/action-helpers";
import { auth } from "@/lib/auth";

const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER ?? "";
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? "";
const APP_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/**
 * Sign out of the app and also end the Keycloak SSO session, then land on /login.
 *
 * Logging out is the one action that must work WITHOUT a valid session (a tab left open
 * past the 1-day session cap): it clears whatever cookie is left and still ends the
 * Keycloak session. When the session is still known we hand Keycloak the stored ID token
 * as `id_token_hint`, so it logs the right session out without a confirmation prompt.
 * `client_id` is always sent — Keycloak requires it next to `post_logout_redirect_uri`
 * whenever the hint is missing.
 */
export async function logout() {
  const session = await getActionSession();

  let idTokenHint: string | undefined;
  if (session) {
    const [keycloakAccount] = await db
      .select({ idToken: account.idToken })
      .from(account)
      .where(and(eq(account.userId, session.user.id), eq(account.providerId, "keycloak")))
      .limit(1);
    idTokenHint = keycloakAccount?.idToken ?? undefined;
  }

  // Deletes the session row (if any) and the cookies; works without a session too.
  await auth.api.signOut({ headers: await headers() });

  const logoutUrl = new URL(`${KEYCLOAK_ISSUER}/protocol/openid-connect/logout`);
  logoutUrl.searchParams.set("client_id", KEYCLOAK_CLIENT_ID);
  logoutUrl.searchParams.set("post_logout_redirect_uri", new URL("/login", APP_URL).toString());
  if (idTokenHint) logoutUrl.searchParams.set("id_token_hint", idTokenHint);

  redirect(logoutUrl.toString());
}
