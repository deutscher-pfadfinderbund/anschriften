import { toNextJsHandler } from "better-auth/next-js";

import { auth, LEGACY_CALLBACK_PATH } from "@/lib/auth";

const handler = toNextJsHandler(auth);

export const POST = handler.POST;

/**
 * better-auth 1.7 serves the OAuth callback at /api/auth/callback/:id. Keycloak still has the
 * pre-1.7 URI registered (see `redirectURI` in src/lib/auth.ts), so a callback on the old path
 * is handed to better-auth under the new one. better-auth routes by the request URL, which a
 * next.config rewrite would leave unchanged.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === LEGACY_CALLBACK_PATH) {
    url.pathname = "/api/auth/callback/keycloak";
    return handler.GET(new Request(url, request));
  }
  return handler.GET(request);
}
