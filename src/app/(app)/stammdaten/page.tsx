import type { Metadata } from "next";

import {
  listOffices,
  listRanks,
  officeDeleteBlockers,
  officeListRules,
  rankDeleteBlockers,
} from "@/db/queries";
import { requirePageSession } from "@/lib/auth-helpers";

import { StammdatenManager } from "./stammdaten-manager";

export const metadata: Metadata = { title: "Ämter & Stände" };

export default async function StammdatenPage() {
  // Authoritative gate: the layout is not re-rendered on RSC navigations.
  await requirePageSession();
  const [offices, ranks, officeBlockers, rankBlockers, officeRules] = await Promise.all([
    listOffices(),
    listRanks(),
    officeDeleteBlockers(),
    rankDeleteBlockers(),
    officeListRules(),
  ]);

  return (
    <StammdatenManager
      offices={offices}
      officeBlockers={Object.fromEntries(officeBlockers)}
      officeListRules={Object.fromEntries(officeRules)}
      ranks={ranks}
      rankBlockers={Object.fromEntries(rankBlockers)}
    />
  );
}
