import { listGroups, listOffices, listPersons } from "@/db/queries";

import { PersonsTable } from "./_components/persons-table";

// Server Component: load every person with assignments in one shot and hand the
// full set to the client table, which filters/sorts client-side (no pagination).
export default async function DirectoryPage() {
  const [persons, groups, offices] = await Promise.all([
    listPersons(),
    listGroups(),
    listOffices(),
  ]);

  return <PersonsTable persons={persons} groups={groups} offices={offices} />;
}
