import { groupUsage, listGroups } from "@/db/queries";
import { requirePageSession } from "@/lib/auth-helpers";

import { GliederungenManager, type GroupUsage } from "./gliederungen-manager";

export default async function GliederungenPage() {
  // Authoritative gate: the layout is not re-rendered on RSC navigations.
  await requirePageSession();
  const [groups, usageMap] = await Promise.all([listGroups(), groupUsage()]);
  const usage: GroupUsage = {};
  for (const [id, u] of usageMap) usage[id] = u;
  return <GliederungenManager groups={groups} usage={usage} />;
}
