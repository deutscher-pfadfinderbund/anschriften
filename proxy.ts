import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate only: if there is no better-auth session cookie, bounce to
// /login. This avoids a DB round-trip on every request. The authoritative check
// (does the session actually exist / is it valid?) lives in (app)/layout.tsx.
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Run on everything except the login page, the auth endpoints, Next internals
  // and any file with an extension (static assets).
  matcher: ["/((?!login|api/auth|_next/static|_next/image|.*\\..*).*)"],
};
