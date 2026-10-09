import type { Metadata } from "next";

import {
  listDistributionLists,
  listGroups,
  listOffices,
  listPersonOptions,
  listRanks,
  mailLogForLists,
} from "@/db/queries";
import { requirePageSession } from "@/lib/auth-helpers";
import { isMailEnabled } from "@/lib/mail";

import { VerteilerManager } from "./verteiler-manager";

export const metadata: Metadata = { title: "Verteiler" };

// Server Component: load every list with its members plus a minimal person index
// for the "add members" picker, then hand it all to the client manager (which reads
// the selected list from `?list=<id>`). When the optional mail module is configured,
// the per-list send history is loaded too.
export default async function VerteilerPage() {
  await requirePageSession();
  const mailEnabled = isMailEnabled();
  const [lists, personOptions, offices, ranks, groups, mailLog] = await Promise.all([
    listDistributionLists(),
    listPersonOptions(),
    listOffices(),
    listRanks(),
    listGroups(),
    mailEnabled ? mailLogForLists() : Promise.resolve([]),
  ]);

  return (
    <VerteilerManager
      lists={lists}
      personOptions={personOptions}
      offices={offices}
      ranks={ranks}
      groups={groups}
      mailEnabled={mailEnabled}
      mailLog={mailLog}
    />
  );
}
