import {
  listDistributionListSummaries,
  listGroups,
  listOffices,
  listRanks,
} from "@/db/queries";
import { requirePageSession } from "@/lib/auth-helpers";

import { PersonForm } from "../_components/person-form";

export default async function NewPersonPage() {
  // Authoritative gate: the layout is not re-rendered on RSC navigations.
  await requirePageSession();
  const [groups, offices, ranks, distributionLists] = await Promise.all([
    listGroups(),
    listOffices(),
    listRanks(),
    listDistributionListSummaries(),
  ]);

  return (
    <PersonForm
      mode="create"
      groups={groups}
      offices={offices}
      ranks={ranks}
      distributionLists={distributionLists}
    />
  );
}
