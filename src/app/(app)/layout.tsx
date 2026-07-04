import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Toaster } from "@/components/ui/sonner";
import { auth } from "@/lib/auth";

import { Sidebar } from "./_components/sidebar";

// Authoritative auth gate for the whole protected area. proxy.ts only does an
// optimistic cookie check; here we actually resolve the session.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }
  const userName = session.user.name?.trim() || session.user.email || "Angemeldet";

  return (
    <div className="flex min-h-screen">
      <Sidebar userName={userName} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      <Toaster />
    </div>
  );
}
