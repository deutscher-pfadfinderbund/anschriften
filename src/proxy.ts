import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate only: if there is no better-auth session cookie, bounce to
// /login. This avoids a DB round-trip on every request. The authoritative check
// (does the session actually exist / is it valid?) lives in each (app) page via
// requirePageSession() — the proxy is not a security boundary.
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Run on everything except the login page, the auth endpoints, Next internals
  // and static assets. The asset exclusion matches only paths ending in a real
  // file extension (`\.[\w]+$`) — not any path merely containing a dot — so a
  // crafted route like `/personen/1.` is NOT bypassed. (The page-level guard is
  // the real protection; this keeps the optimistic gate honest too.)
  matcher: ["/((?!login|api/auth|_next/static|_next/image|.*\\.[\\w]+$).*)"],
};
