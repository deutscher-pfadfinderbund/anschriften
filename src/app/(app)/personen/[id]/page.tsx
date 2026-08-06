import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getPersonForEdit,
  listDistributionListSummaries,
  listGroups,
  listOffices,
  listRanks,
} from "@/db/queries";
import { requirePageSession } from "@/lib/auth-helpers";
import { formatName } from "@/lib/format";

import { PersonForm } from "../_components/person-form";

// Memoized per request so generateMetadata and the page share one round-trip.
const loadPerson = cache(getPersonForEdit);

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  // Same gate as the page: never read a person before the session is checked.
  await requirePageSession();
  const { id } = await params;
  const personId = parseId(id);
  const person = personId != null ? await loadPerson(personId) : null;
  return { title: person ? formatName(person) : "Anschrift bearbeiten" };
}

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Authoritative gate: the layout is not re-rendered on RSC navigations.
  await requirePageSession();
  const { id } = await params;
  const personId = parseId(id);
  if (personId == null) notFound();

  const [person, groups, offices, ranks, distributionLists] = await Promise.all([
    loadPerson(personId),
    listGroups(),
    listOffices(),
    listRanks(),
    listDistributionListSummaries(),
  ]);
  if (!person) notFound();

  return (
    <PersonForm
      mode="edit"
      person={person}
      groups={groups}
      offices={offices}
      ranks={ranks}
      distributionLists={distributionLists}
    />
  );
}
