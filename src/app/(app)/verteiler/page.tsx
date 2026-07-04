import { listDistributionLists, listPersonOptions } from "@/db/queries";

import { VerteilerManager } from "./verteiler-manager";

// Server Component: load every list with its members plus a minimal person index
// for the "add members" picker, then hand it all to the client manager.
export default async function VerteilerPage() {
  const [lists, personOptions] = await Promise.all([
    listDistributionLists(),
    listPersonOptions(),
  ]);

  return <VerteilerManager lists={lists} personOptions={personOptions} />;
}
