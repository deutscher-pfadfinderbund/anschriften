import {
  listDistributionListSummaries,
  listGroups,
  listOffices,
  listRanks,
} from "@/db/queries";

import { PersonForm } from "../_components/person-form";

export default async function NewPersonPage() {
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
