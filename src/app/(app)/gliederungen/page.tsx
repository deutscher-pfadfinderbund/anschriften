import { groupUsage, listGroups } from "@/db/queries";

import { GliederungenManager, type GroupUsage } from "./gliederungen-manager";

export default async function GliederungenPage() {
  const [groups, usageMap] = await Promise.all([listGroups(), groupUsage()]);
  const usage: GroupUsage = {};
  for (const [id, u] of usageMap) usage[id] = u;
  return <GliederungenManager groups={groups} usage={usage} />;
}
