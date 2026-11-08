import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";

/**
 * The current session, or null. Route handlers pass their request's headers; pages and
 * Server Actions read them from the incoming request.
 */
export async function getSession(requestHeaders?: Headers) {
  return auth.api.getSession({ headers: requestHeaders ?? (await headers()) });
}

/**
 * The session of an export download, or null. The session cookie is SameSite=Lax, so a
 * foreign page could otherwise make a signed-in browser start exports (a PDF spawns Typst)
 * by plain navigation. Only same-origin requests (our download buttons) and direct ones
 * (typed URL, older clients without Sec-Fetch-Site) count.
 */
export async function getExportSession(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return null;
  return getSession(request.headers);
}

/**
 * Authoritative session gate for page components under (app). The layout check is
 * NOT a security boundary: Next.js skips re-rendering layouts on RSC navigations,
 * so pages can render without it. Each protected page must call this first, before
 * loading any data; without a session it redirects to /login.
 *
 * Wrapped in React `cache()`: every call within one request (page, `generateMetadata`,
 * the layout) shares a single session lookup instead of hitting the database once each.
 */
export const requirePageSession = cache(async () => {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
});

/** Who to record in `updated_by`: display name, else e-mail. */
export function actorName(session: { user: { name?: string | null; email?: string | null } }): string {
  return session.user.name?.trim() || session.user.email || "unbekannt";
}
