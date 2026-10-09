import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate for page navigations only: if there is no better-auth session cookie,
// bounce to /login. This avoids a DB round-trip on every request. It is not a security
// boundary — every (app) page calls requirePageSession(), every Server Action checks the
// session itself, and the route handlers under /api answer 401 on their own.
//
// Everything that is not a page navigation passes through untouched:
//  - Server Action POSTs (`next-action` header, or any non-GET/HEAD): a redirect to /login
//    would make the client throw and the error boundary would wipe the open form. The
//    action instead returns SESSION_EXPIRED and the form keeps the user's input.
//  - /api/* (excluded in the matcher): a fetch-based download must get a 401 it can
//    recognise, not a login page it would save as .pdf/.csv.
export function proxy(request: NextRequest) {
  const isNavigation = request.method === "GET" || request.method === "HEAD";
  if (!isNavigation || request.headers.has("next-action")) return NextResponse.next();

  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Run on everything except the login page, the API routes (auth + exports, which check
  // the session themselves), Next internals and static assets. The asset exclusion matches
  // only paths ending in a real file extension (`\.[\w]+$`) — not any path merely containing
  // a dot — so a crafted route like `/personen/1.` is NOT bypassed.
  matcher: ["/((?!login|api/|_next/static|_next/image|.*\\.[\\w]+$).*)"],
};
