import type { Metadata } from "next";

import {
  listDistributionListSummaries,
  listGroups,
  listOffices,
  listPersons,
} from "@/db/queries";
import { requirePageSession } from "@/lib/auth-helpers";
import { isMailEnabled } from "@/lib/mail";

import { PersonsTable } from "./_components/persons-table";

export const metadata: Metadata = { title: "Verzeichnis" };

// Server Component: load every person with assignments in one shot and hand the
// full set to the client table, which filters/sorts client-side (no pagination).
export default async function DirectoryPage() {
  // Authoritative gate: the layout is not re-rendered on RSC navigations.
  await requirePageSession();
  const [persons, groups, offices, distributionLists] = await Promise.all([
    listPersons(),
    listGroups(),
    listOffices(),
    listDistributionListSummaries(),
  ]);

  return (
    <PersonsTable
      persons={persons}
      groups={groups}
      offices={offices}
      distributionLists={distributionLists}
      mailEnabled={isMailEnabled()}
    />
  );
}
