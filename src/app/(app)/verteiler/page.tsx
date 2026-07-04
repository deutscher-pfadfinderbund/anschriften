import { listDistributionLists, listOffices, listPersonOptions, mailLogForLists } from "@/db/queries";
import { isMailEnabled } from "@/lib/mail";

import { VerteilerManager } from "./verteiler-manager";

// Server Component: load every list with its members plus a minimal person index
// for the "add members" picker, then hand it all to the client manager.
// `?list=<id>` deep-links to a specific Verteiler. When the optional mail module
// is configured, the per-list send history is loaded too.
export default async function VerteilerPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const mailEnabled = isMailEnabled();
  const [lists, personOptions, offices, mailLog, { list }] = await Promise.all([
    listDistributionLists(),
    listPersonOptions(),
    listOffices(),
    mailEnabled ? mailLogForLists() : Promise.resolve([]),
    searchParams,
  ]);
  const initialListId = list != null && /^\d+$/.test(list) ? Number(list) : null;

  return (
    <VerteilerManager
      lists={lists}
      personOptions={personOptions}
      offices={offices}
      initialListId={initialListId}
      mailEnabled={mailEnabled}
      mailLog={mailLog}
    />
  );
}
