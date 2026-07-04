import { headers } from "next/headers";

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

/** Who to record in `updated_by`: display name, else e-mail. */
export function actorName(session: { user: { name?: string | null; email?: string | null } }): string {
  return session.user.name?.trim() || session.user.email || "unbekannt";
}
