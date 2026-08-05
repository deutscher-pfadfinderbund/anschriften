"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { account } from "@/db/auth-schema";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/auth-helpers";

const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER ?? "";
const APP_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/**
 * Sign out of the app and also end the Keycloak SSO session. We hand Keycloak
 * the stored ID token as `id_token_hint` so it can log the right session out and
 * skip the confirmation prompt, then it redirects back to /login.
 */
export async function logout() {
  // Defense in depth, consistent with every other action: no session, nothing
  // to log out (throws "Nicht angemeldet.").
  const session = await requireSession();
  const requestHeaders = await headers();

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
  const idTokenHint: string | undefined = keycloakAccount?.idToken ?? undefined;

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
