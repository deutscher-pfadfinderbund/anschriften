import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  listDistributionListNames,
  listGroups,
  listOffices,
  listPersons,
} from "@/db/queries";
import { requirePageSession } from "@/lib/auth-helpers";
import { isMailEnabled } from "@/lib/mail";

import { Directory } from "./_components/directory";
import { personCount } from "./_components/directory-filter";

export const metadata: Metadata = { title: "Verzeichnis" };

// Server Component: load every person with assignments in one shot and hand the
// full set to the client, which searches, filters and sorts (no pagination).
export default async function DirectoryPage() {
  // Authoritative gate: the layout is not re-rendered on RSC navigations.
  await requirePageSession();
  const [persons, groups, offices, distributionLists] = await Promise.all([
    listPersons(),
    listGroups(),
    listOffices(),
    listDistributionListNames(),
  ]);

  return (
    <>
      <PageHeader
        title="Verzeichnis"
        subtitle={personCount(persons.length)}
        actions={
          <Button asChild>
            <Link href="/personen/neu">
              <Plus />
              Neue Person
            </Link>
          </Button>
        }
      />
      <PageBody>
        <Directory
          persons={persons}
          groups={groups}
          offices={offices}
          distributionLists={distributionLists}
          mailEnabled={isMailEnabled()}
        />
      </PageBody>
    </>
  );
}
