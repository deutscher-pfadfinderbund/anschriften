import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { decodeJwt } from "jose";

import { db } from "@/db";
import * as authSchema from "@/db/auth-schema";

const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER ?? "";
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? "";
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET ?? "";
const APP_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

// The single Keycloak client role that grants access to the Anschriftenverzeichnis.
const REQUIRED_ROLE = "anschriften";

/**
 * Role gate. Keycloak is configured to emit the client roles into the ID token
 * (`resource_access[client].roles`). We decode the ID token — no signature check
 * is needed because it arrives straight from Keycloak's token endpoint over the
 * back channel — and only let users carrying the `anschriften` client role in.
 *
 * Rejection happens here, inside `getUserInfo`, i.e. *before* better-auth creates
 * any user/session/account row, so a denied login leaves no orphan data. We throw
 * a `FOUND` (302) redirect to the login page instead of a `FORBIDDEN` error, so the
 * browser lands on our German "Kein Zugriff" page rather than a raw JSON 403.
 */
function assertRole(claims: Record<string, unknown>): void {
  const resourceAccess = claims.resource_access as
    | Record<string, { roles?: string[] } | undefined>
    | undefined;
  const roles = resourceAccess?.[KEYCLOAK_CLIENT_ID]?.roles ?? [];
  if (!roles.includes(REQUIRED_ROLE)) {
    const location = new URL("/login?error=access_denied", APP_URL).toString();
    throw new APIError("FOUND", undefined, { Location: location });
  }
}

export const auth = betterAuth({
  baseURL: APP_URL,
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  // No local accounts — the only way in is Keycloak SSO.
  emailAndPassword: { enabled: false },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh at most once per day
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "keycloak",
          discoveryUrl: `${KEYCLOAK_ISSUER}/.well-known/openid-configuration`,
          clientId: KEYCLOAK_CLIENT_ID,
          clientSecret: KEYCLOAK_CLIENT_SECRET,
          scopes: ["openid", "profile", "email"],
          // We build the user straight from the ID token claims (Keycloak returns
          // sub/email/name for the requested scopes) and gate on the client role.
          getUserInfo: async (tokens) => {
            const idToken = tokens.idToken;
            if (!idToken) return null;
            const claims = decodeJwt(idToken);
            assertRole(claims);
            const email = typeof claims.email === "string" ? claims.email : null;
            const name =
              (typeof claims.name === "string" && claims.name) ||
              (typeof claims.preferred_username === "string" &&
                claims.preferred_username) ||
              "";
            return {
              id: String(claims.sub),
              email,
              emailVerified: Boolean(claims.email_verified),
              name,
              image:
                typeof claims.picture === "string" ? claims.picture : undefined,
            };
          },
        },
      ],
    }),
    // Must stay last: lets the better-auth server API set cookies from Server
    // Actions / Route Handlers via next/headers.
    nextCookies(),
  ],
});
