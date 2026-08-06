import {
  listDistributionListSummaries,
  listGroups,
  listOffices,
  listPersonOptions,
  listRanks,
} from "@/db/queries";
import { requirePageSession } from "@/lib/auth-helpers";

import { PersonForm } from "../_components/person-form";

export default async function NewPersonPage() {
  // Authoritative gate: the layout is not re-rendered on RSC navigations.
  await requirePageSession();
  const [groups, offices, ranks, distributionLists, existingPersons] = await Promise.all([
    listGroups(),
    listOffices(),
    listRanks(),
    listDistributionListSummaries(),
    // Lightweight name list for the non-blocking duplicate-person hint.
    listPersonOptions(),
  ]);

  return (
    <PersonForm
      mode="create"
      groups={groups}
      offices={offices}
      ranks={ranks}
      distributionLists={distributionLists}
      existingPersons={existingPersons}
    />
  );
}
