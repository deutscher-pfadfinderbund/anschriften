"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  distributionListMembers,
  distributionListOfficeRules,
  distributionLists,
} from "@/db/schema";
import {
  firstError,
  isForeignKeyViolation,
  isUniqueViolation,
  type ActionResult,
} from "@/lib/action-helpers";
import { requireSession } from "@/lib/auth-helpers";

export type CreateListResult = { ok: true; id: number } | { ok: false; message: string };

const listSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name ist erforderlich.")
    .max(200, "Eingabe ist zu lang (max. 200 Zeichen)."),
  description: z
    .string()
    .trim()
    .max(2000, "Eingabe ist zu lang (max. 2000 Zeichen).")
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type ListInput = z.infer<typeof listSchema>;

export async function createList(raw: ListInput): Promise<CreateListResult> {
  await requireSession();
  const parsed = listSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    const [row] = await db
      .insert(distributionLists)
      .values(parsed.data)
      .returning({ id: distributionLists.id });
    revalidatePath("/verteiler");
    // Manual memberships also drive the Verteiler badges and list filter on "/".
    revalidatePath("/");
    return { ok: true, id: row.id };
  } catch (err) {
    if (isUniqueViolation(err))
      return { ok: false, message: "Ein Verteiler mit diesem Namen existiert bereits." };
    throw err;
  }
}

export async function updateList(id: number, raw: ListInput): Promise<ActionResult> {
  await requireSession();
  const parsed = listSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    await db.update(distributionLists).set(parsed.data).where(eq(distributionLists.id, id));
  } catch (err) {
    if (isUniqueViolation(err))
      return { ok: false, message: "Ein Verteiler mit diesem Namen existiert bereits." };
    throw err;
  }
  revalidatePath("/verteiler");
  // Manual memberships also drive the Verteiler badges and list filter on "/".
  revalidatePath("/");
  return { ok: true };
}

export async function deleteList(id: number): Promise<ActionResult> {
  await requireSession();
  // Memberships cascade via the distribution_list_members FK (onDelete: cascade).
  await db.delete(distributionLists).where(eq(distributionLists.id, id));
  revalidatePath("/verteiler");
  // Manual memberships also drive the Verteiler badges and list filter on "/".
  revalidatePath("/");
  return { ok: true };
}

/** Add persons to a list; duplicates are ignored so re-adding is harmless. */
export async function addMembers(listId: number, personIds: number[]): Promise<ActionResult> {
  await requireSession();
  const ids = [...new Set(personIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return { ok: true };
  try {
    await db
      .insert(distributionListMembers)
      .values(ids.map((personId) => ({ listId, personId })))
      .onConflictDoNothing();
  } catch (err) {
    // Race: the list or a person was deleted between page load and this call.
    if (isForeignKeyViolation(err))
      return { ok: false, message: "Verteiler oder Anschrift existiert nicht mehr. Bitte Seite neu laden." };
    throw err;
  }
  revalidatePath("/verteiler");
  // Manual memberships also drive the Verteiler badges and list filter on "/".
  revalidatePath("/");
  return { ok: true };
}

export async function removeMember(listId: number, personId: number): Promise<ActionResult> {
  await requireSession();
  await db
    .delete(distributionListMembers)
    .where(
      and(
        eq(distributionListMembers.listId, listId),
        eq(distributionListMembers.personId, personId),
      ),
    );
  revalidatePath("/verteiler");
  // Manual memberships also drive the Verteiler badges and list filter on "/".
  revalidatePath("/");
  return { ok: true };
}

/**
 * Office rules change the effective membership of a list, so they affect the
 * Verteiler detail, the directory table filter and the Ämter page alike.
 */
function revalidateEffectiveMembership() {
  revalidatePath("/verteiler");
  revalidatePath("/");
  revalidatePath("/stammdaten");
}

/** Bind an office to a list: whoever holds it is then an automatic member. Idempotent. */
export async function addOfficeRule(listId: number, officeId: number): Promise<ActionResult> {
  await requireSession();
  if (!Number.isInteger(listId) || listId <= 0)
    return { ok: false, message: "Ungültiger Verteiler." };
  if (!Number.isInteger(officeId) || officeId <= 0)
    return { ok: false, message: "Ungültiges Amt." };
  try {
    await db.insert(distributionListOfficeRules).values({ listId, officeId }).onConflictDoNothing();
  } catch (err) {
    // Race: the list or the office was deleted between page load and this call.
    if (isForeignKeyViolation(err))
      return {
        ok: false,
        message: "Verteiler oder Amt existiert nicht mehr. Bitte Seite neu laden.",
      };
    throw err;
  }
  revalidateEffectiveMembership();
  return { ok: true };
}

/** Remove an office rule from a list. The office holders are no longer auto-included. */
export async function removeOfficeRule(listId: number, officeId: number): Promise<ActionResult> {
  await requireSession();
  if (!Number.isInteger(listId) || listId <= 0 || !Number.isInteger(officeId) || officeId <= 0)
    return { ok: false, message: "Ungültige Auswahl." };
  await db
    .delete(distributionListOfficeRules)
    .where(
      and(
        eq(distributionListOfficeRules.listId, listId),
        eq(distributionListOfficeRules.officeId, officeId),
      ),
    );
  revalidateEffectiveMembership();
  return { ok: true };
}
