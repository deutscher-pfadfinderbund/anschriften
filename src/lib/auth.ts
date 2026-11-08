import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { decodeJwt } from "jose";

import { db } from "@/db";
import * as authSchema from "@/db/auth-schema";

const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER ?? "";
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? "";
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET ?? "";
const APP_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const PROVIDER_ID = "keycloak";
/** better-auth's own OAuth callback route (since 1.7). */
export const CALLBACK_PATH = `/api/auth/callback/${PROVIDER_ID}`;
/**
 * The callback URI Keycloak has registered (better-auth < 1.7). Announced as redirectURI and
 * bridged onto CALLBACK_PATH by the auth catch-all route.
 * ponytail: temporary bridge — once Keycloak lists CALLBACK_PATH as a valid redirect URI, drop
 * this, the redirectURI override and the custom GET in src/app/api/auth/[...all]/route.ts.
 */
export const LEGACY_CALLBACK_PATH = `/api/auth/oauth2/callback/${PROVIDER_ID}`;

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
 * browser lands on our German login page rather than a raw JSON 403. `access_denied` is the
 * one code for which the login page must say "Kein Zugriff"; every other `?error=` (see
 * `onAPIError` below) only means "try again". The denial is logged with the roles found: if every
 * user is turned away, the usual cause is a Keycloak mapper that does not put the client
 * roles into the ID token, and this line is the only place that shows it.
 */
function assertRole(claims: Record<string, unknown>): void {
  const resourceAccess = claims.resource_access as
    | Record<string, { roles?: string[] } | undefined>
    | undefined;
  const roles = resourceAccess?.[KEYCLOAK_CLIENT_ID]?.roles ?? [];
  if (!roles.includes(REQUIRED_ROLE)) {
    console.warn(
      `Login denied: sub=${String(claims.sub)} lacks client role "${REQUIRED_ROLE}" ` +
        `(roles for client "${KEYCLOAK_CLIENT_ID}": ${roles.length > 0 ? roles.join(", ") : "none"})`,
    );
    const location = new URL("/login?error=access_denied", APP_URL).toString();
    throw new APIError("FOUND", undefined, { Location: location });
  }
}

export const auth = betterAuth({
  baseURL: APP_URL,
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  // No local accounts — the only way in is Keycloak SSO.
  emailAndPassword: { enabled: false },
  // OAuth failures better-auth detects itself (expired/mismatched state after the back
  // button or a second tab, `?error=` from Keycloak, token exchange failures) land on our
  // German login page with `?error=<code>` instead of better-auth's English error page.
  // These are retryable, so the login page must not show them as "Kein Zugriff".
  onAPIError: { errorURL: "/login" },
  // Endpoints the app never uses but a signed-in user could call directly. Most important:
  // /update-user would let anyone rename themselves, and that name is what every
  // `updated_by` and `mail_log.sent_by` records. Name and e-mail come from Keycloak only.
  disabledPaths: [
    "/update-user",
    "/change-email",
    "/delete-user",
    "/update-session",
    "/link-social",
    "/unlink-account",
    "/get-access-token",
    "/refresh-token",
  ],
  hooks: {
    // better-auth 1.7 lets /sign-in/social accept a bare ID token for any provider with a JWKS
    // (Keycloak's discovery has one). The app only signs in through the code flow with state,
    // PKCE and nonce, so a client-submitted token (e.g. replayed from an id_token_hint in a
    // logout URL) must never open a session.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/social" && ctx.body?.idToken) {
        throw new APIError("BAD_REQUEST", { message: "ID token sign-in is disabled" });
      }
    }),
  },
  session: {
    // Roles are only checked at login (deliberate simplification per roadmap:
    // "role removal takes effect at session expiry"). To keep that blast radius
    // small we cap the session at 1 day. updateAge == expiresIn disables the
    // sliding refresh, so an active user's session cannot outlive that hard cap.
    expiresIn: 60 * 60 * 24, // 1 day
    updateAge: 60 * 60 * 24, // no sliding window: never refreshed before expiry
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: PROVIDER_ID,
          discoveryUrl: `${KEYCLOAK_ISSUER}/.well-known/openid-configuration`,
          clientId: KEYCLOAK_CLIENT_ID,
          clientSecret: KEYCLOAK_CLIENT_SECRET,
          // Keycloak still has the pre-1.7 callback registered (see LEGACY_CALLBACK_PATH).
          redirectURI: new URL(LEGACY_CALLBACK_PATH, APP_URL).toString(),
          scopes: ["openid", "profile", "email"],
          // Re-sync name/e-mail from the ID token on every login, so a change in Keycloak
          // reaches the app (and `updated_by`) at the next sign-in.
          overrideUserInfo: true,
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
