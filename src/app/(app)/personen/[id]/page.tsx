import { notFound } from "next/navigation";

import { getPersonForEdit, listGroups, listOffices, listRanks } from "@/db/queries";

import { PersonForm } from "../_components/person-form";

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isInteger(personId) || personId <= 0) notFound();

  const [person, groups, offices, ranks] = await Promise.all([
    getPersonForEdit(personId),
    listGroups(),
    listOffices(),
    listRanks(),
  ]);
  if (!person) notFound();

  return <PersonForm mode="edit" person={person} groups={groups} offices={offices} ranks={ranks} />;
}
