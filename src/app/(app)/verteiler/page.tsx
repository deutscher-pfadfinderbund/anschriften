import { listDistributionLists, listOffices, listPersonOptions } from "@/db/queries";

import { VerteilerManager } from "./verteiler-manager";

// Server Component: load every list with its members plus a minimal person index
// for the "add members" picker, then hand it all to the client manager.
// `?list=<id>` deep-links to a specific Verteiler.
export default async function VerteilerPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const [lists, personOptions, offices, { list }] = await Promise.all([
    listDistributionLists(),
    listPersonOptions(),
    listOffices(),
    searchParams,
  ]);
  const initialListId = list != null && /^\d+$/.test(list) ? Number(list) : null;

  return (
    <VerteilerManager
      lists={lists}
      personOptions={personOptions}
      offices={offices}
      initialListId={initialListId}
    />
  );
}
