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
// for the "add members" picker, then hand it all to the client manager.
// `?list=<id>` deep-links to a specific Verteiler. When the optional mail module
// is configured, the per-list send history is loaded too.
export default async function VerteilerPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  // Authoritative gate: the layout is not re-rendered on RSC navigations.
  await requirePageSession();
  const mailEnabled = isMailEnabled();
  const [lists, personOptions, offices, ranks, groups, mailLog, { list }] = await Promise.all([
    listDistributionLists(),
    listPersonOptions(),
    listOffices(),
    listRanks(),
    listGroups(),
    mailEnabled ? mailLogForLists() : Promise.resolve([]),
    searchParams,
  ]);
  const initialListId = list != null && /^\d+$/.test(list) ? Number(list) : null;

  return (
    <VerteilerManager
      lists={lists}
      personOptions={personOptions}
      offices={offices}
      ranks={ranks}
      groups={groups}
      initialListId={initialListId}
      mailEnabled={mailEnabled}
      mailLog={mailLog}
    />
  );
}
