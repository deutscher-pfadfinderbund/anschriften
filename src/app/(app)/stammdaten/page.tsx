import { listOffices, listRanks, officeUsage, rankUsage } from "@/db/queries";

import { StammdatenManager } from "./stammdaten-manager";

export default async function StammdatenPage() {
  const [offices, ranks, officeUse, rankUse] = await Promise.all([
    listOffices(),
    listRanks(),
    officeUsage(),
    rankUsage(),
  ]);

  const officeUsageObj: Record<number, number> = {};
  for (const [id, n] of officeUse) officeUsageObj[id] = n;
  const rankUsageObj: Record<number, number> = {};
  for (const [id, n] of rankUse) rankUsageObj[id] = n;

  return (
    <StammdatenManager
      offices={offices}
      officeUsage={officeUsageObj}
      ranks={ranks}
      rankUsage={rankUsageObj}
    />
  );
}
