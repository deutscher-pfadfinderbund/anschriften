import { listOffices, listRanks, officeListRules, officeUsage, rankUsage } from "@/db/queries";
import type { OfficeListRule } from "@/db/queries";
import { requirePageSession } from "@/lib/auth-helpers";

import { StammdatenManager } from "./stammdaten-manager";

export default async function StammdatenPage() {
  // Authoritative gate: the layout is not re-rendered on RSC navigations.
  await requirePageSession();
  const [offices, ranks, officeUse, rankUse, officeRules] = await Promise.all([
    listOffices(),
    listRanks(),
    officeUsage(),
    rankUsage(),
    officeListRules(),
  ]);

  const officeUsageObj: Record<number, number> = {};
  for (const [id, n] of officeUse) officeUsageObj[id] = n;
  const rankUsageObj: Record<number, number> = {};
  for (const [id, n] of rankUse) rankUsageObj[id] = n;
  const officeRulesObj: Record<number, OfficeListRule[]> = {};
  for (const [id, lists] of officeRules) officeRulesObj[id] = lists;

  return (
    <StammdatenManager
      offices={offices}
      officeUsage={officeUsageObj}
      officeListRules={officeRulesObj}
      ranks={ranks}
      rankUsage={rankUsageObj}
    />
  );
}
