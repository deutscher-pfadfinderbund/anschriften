"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { assignments, distributionListMembers, persons } from "@/db/schema";
import { actorName, requireSession } from "@/lib/auth-helpers";
import {
  parsePersonInput,
  validateTenure,
  type AssignmentInput,
  type FieldErrors,
  type PersonInput,
} from "@/lib/person-schema";

/** Postgres unique-violation SQLSTATE — the active-tenure partial unique index. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505"
  );
}

export type SaveResult =
  | { ok: true; id: number }
  | { ok: false; errors: FieldErrors; message?: string };

const trimOrNull = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
};

/** Drop empty numbers, default the label, dedupe assignments by (group, office). */
function clean(input: PersonInput): PersonInput {
  const seen = new Set<string>();
  const uniqueAssignments: AssignmentInput[] = [];
  for (const a of input.assignments) {
    if (!a.groupId) continue;
    const key = `${a.groupId}:${a.officeId ?? "null"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Keep the "seit" date; blank strings become null (unknown).
    uniqueAssignments.push({
      groupId: a.groupId,
      officeId: a.officeId ?? null,
      startDate: trimOrNull(a.startDate),
    });
  }

  return {
    ...input,
    distributionListIds: [...new Set(input.distributionListIds)],
    salutation: trimOrNull(input.salutation),
    title: trimOrNull(input.title),
    firstName: trimOrNull(input.firstName),
    lastName: trimOrNull(input.lastName),
    scoutName: trimOrNull(input.scoutName),
    birthDate: trimOrNull(input.birthDate),
    deathDate: trimOrNull(input.deathDate),
    street: trimOrNull(input.street),
    addressExtra: trimOrNull(input.addressExtra),
    postalCode: trimOrNull(input.postalCode),
    city: trimOrNull(input.city),
    email: trimOrNull(input.email),
    notes: trimOrNull(input.notes),
    phones: input.phones
      .map((p) => ({ label: (p.label || "Telefon").trim() || "Telefon", number: (p.number ?? "").trim() }))
      .filter((p) => p.number.length > 0),
    assignments: uniqueAssignments,
  };
}

/** Create or update a person plus its assignments (delete + recreate) in one transaction. */
export async function savePerson(raw: PersonInput): Promise<SaveResult> {
  const session = await requireSession();

  const parsed = parsePersonInput(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const data = clean(parsed.data);

  // Re-validate the cleaned payload (empty PLZ/e-mail become null → no false errors).
  const revalidated = parsePersonInput(data);
  if (!revalidated.ok) return { ok: false, errors: revalidated.errors };

  // Active tenures carry only a "seit" date; validate its format (end is always null here).
  for (const a of data.assignments) {
    const err = validateTenure(a.startDate ?? null, null);
    if (err) return { ok: false, errors: {}, message: err };
  }

  const by = actorName(session);
  const fields = {
    salutation: data.salutation,
    title: data.title,
    firstName: data.firstName,
    lastName: data.lastName,
    scoutName: data.scoutName,
    birthDate: data.birthDate,
    deathDate: data.deathDate,
    rankId: data.rankId,
    street: data.street,
    addressExtra: data.addressExtra,
    postalCode: data.postalCode,
    city: data.city,
    email: data.email,
    phones: data.phones,
    notes: data.notes,
    doNotPrint: data.doNotPrint,
    updatedBy: by,
    updatedAt: new Date(),
  };

  let id: number;
  try {
    id = await db.transaction(async (tx) => {
      let personId = data.id;
      if (personId) {
        await tx.update(persons).set(fields).where(eq(persons.id, personId));
        // Delete + recreate only the ACTIVE tenures. Ended tenures (end_date set) are
        // the office history and are managed separately (see actions/assignments.ts) —
        // the person form never carries them, so they must survive a normal save.
        await tx
          .delete(assignments)
          .where(and(eq(assignments.personId, personId), isNull(assignments.endDate)));
      } else {
        const [row] = await tx.insert(persons).values(fields).returning({ id: persons.id });
        personId = row.id;
      }
      if (data.assignments.length > 0) {
        await tx.insert(assignments).values(
          data.assignments.map((a) => ({
            personId: personId!,
            groupId: a.groupId,
            officeId: a.officeId,
            startDate: a.startDate ?? null,
            endDate: null,
          })),
        );
      }

      // Distribution-list memberships: delete + recreate, same as assignments.
      await tx.delete(distributionListMembers).where(eq(distributionListMembers.personId, personId!));
      if (data.distributionListIds.length > 0) {
        await tx.insert(distributionListMembers).values(
          data.distributionListIds.map((listId) => ({ listId, personId: personId! })),
        );
      }
      return personId!;
    });
  } catch (err) {
    // The active-tenure partial unique index rejected a second active (person, group, office).
    if (isUniqueViolation(err))
      return {
        ok: false,
        errors: {},
        message: "Diese Amt-Gliederungs-Kombination ist bereits aktiv zugeordnet.",
      };
    throw err;
  }

  revalidatePath("/");
  revalidatePath("/verteiler");
  return { ok: true, id };
}

export async function deletePerson(id: number): Promise<{ ok: true }> {
  await requireSession();
  await db.delete(persons).where(eq(persons.id, id));
  revalidatePath("/");
  // Memberships cascade with the person, so the list counts change too.
  revalidatePath("/verteiler");
  return { ok: true };
}
