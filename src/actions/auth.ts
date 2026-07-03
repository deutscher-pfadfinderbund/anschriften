"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { account } from "@/db/auth-schema";
import { auth } from "@/lib/auth";

const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER ?? "";
const APP_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/**
 * Sign out of the app and also end the Keycloak SSO session. We hand Keycloak
 * the stored ID token as `id_token_hint` so it can log the right session out and
 * skip the confirmation prompt, then it redirects back to /login.
 */
export async function logout() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  let idTokenHint: string | undefined;
  if (session) {
    const [keycloakAccount] = await db
      .select({ idToken: account.idToken })
      .from(account)
      .where(
        and(
          eq(account.userId, session.user.id),
          eq(account.providerId, "keycloak"),
        ),
      )
      .limit(1);
    idTokenHint = keycloakAccount?.idToken ?? undefined;
  }

  await auth.api.signOut({ headers: requestHeaders });

  const logoutUrl = new URL(
    `${KEYCLOAK_ISSUER}/protocol/openid-connect/logout`,
  );
  logoutUrl.searchParams.set(
    "post_logout_redirect_uri",
    new URL("/login", APP_URL).toString(),
  );
  if (idTokenHint) {
    logoutUrl.searchParams.set("id_token_hint", idTokenHint);
  }

  redirect(logoutUrl.toString());
}
