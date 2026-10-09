import type { Metadata } from "next";

import {
  listDistributionListNames,
  listActiveOfficeHolders,
  listGroups,
  listOffices,
  listPersonOptions,
  listRanks,
} from "@/db/queries";
import { requirePageSession } from "@/lib/auth-helpers";

import { PersonForm } from "../_components/person-form";

export const metadata: Metadata = { title: "Neue Person" };

export default async function NewPersonPage() {
  await requirePageSession();
  const [groups, offices, ranks, distributionLists, existingPersons, activeHolders] = await Promise.all([
    listGroups(),
    listOffices(),
    listRanks(),
    listDistributionListNames(),
    // Lightweight name list for the non-blocking duplicate-person hint.
    listPersonOptions(),
    listActiveOfficeHolders(),
  ]);

  return (
    <PersonForm
      groups={groups}
      offices={offices}
      ranks={ranks}
      distributionLists={distributionLists}
      activeHolders={activeHolders}
      existingPersons={existingPersons}
    />
  );
}
