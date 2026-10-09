import type { Metadata } from "next";

import { groupDeleteBlockers, listGroups } from "@/db/queries";
import { requirePageSession } from "@/lib/auth-helpers";

import { GliederungenManager } from "./gliederungen-manager";

export const metadata: Metadata = { title: "Gliederungen" };

export default async function GliederungenPage() {
  // Authoritative gate: the layout is not re-rendered on RSC navigations.
  await requirePageSession();
  const [groups, blockers] = await Promise.all([listGroups(), groupDeleteBlockers()]);
  return <GliederungenManager groups={groups} blockers={Object.fromEntries(blockers)} />;
}
