import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

/**
 * Resolve the session inside a Server Action (defense in depth: the (app) layout
 * already gates, but every mutation re-checks). Throws if there is no session.
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
 * loading any data. Unlike `requireSession()` (which throws, for Server Actions),
 * this cleanly redirects to /login — mirroring the layout's own behavior.
 */
export async function requirePageSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session;
}

/** Who to record in `updated_by`: display name, else e-mail. */
export function actorName(session: { user: { name?: string | null; email?: string | null } }): string {
  return session.user.name?.trim() || session.user.email || "unbekannt";
}
