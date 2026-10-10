import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/page-header";
import { recentAudit } from "@/db/queries";
import { requirePageSession } from "@/lib/auth-helpers";

import { ProtokollList } from "./protokoll-list";

export const metadata: Metadata = { title: "Protokoll" };

/** How many of the latest changes the page loads (and filters on the client). */
const LIMIT = 300;

// The change log across all persons, newest first. A person's own log is the
// "Änderungsverlauf" at the bottom of its editor.
export default async function ProtokollPage() {
  await requirePageSession();
  const entries = await recentAudit(LIMIT);
  return (
    <>
      <PageHeader
        title="Protokoll"
        subtitle="Wer wann was geändert hat – an Personen, ihren Ämtern und Verteilern."
      />
      <PageBody>
        <ProtokollList entries={entries} limit={LIMIT} />
      </PageBody>
    </>
  );
}
