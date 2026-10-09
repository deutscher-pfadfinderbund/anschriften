import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";

/**
 * Resolve the session inside a Server Action. Throws if there is no session.
 * Prefer `getActionSession()` + `SESSION_EXPIRED` from src/lib/action-helpers.ts: a thrown
 * error replaces the page with the error boundary and loses unsaved form input.
 */
export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Nicht angemeldet.");
  return session;
}

/**
 * Authoritative session gate for page components under (app). The layout check is
 * NOT a security boundary: Next.js skips re-rendering layouts on RSC navigations,
 * so pages can render without it. Each protected page must call this first, before
 * loading any data; without a session it redirects to /login.
 *
 * Wrapped in React `cache()`, so the layout, the page and `generateMetadata` share one
 * session lookup per request instead of hitting the database once each.
 */
export const requirePageSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session;
});

/** Who to record in `updated_by`: display name, else e-mail. */
export function actorName(session: { user: { name?: string | null; email?: string | null } }): string {
  return session.user.name?.trim() || session.user.email || "unbekannt";
}
