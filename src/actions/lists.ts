"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  distributionListGroupRules,
  distributionListMembers,
  distributionListOfficeRules,
  distributionListRankRules,
  distributionLists,
} from "@/db/schema";
import {
  firstError,
  isForeignKeyViolation,
  isUniqueViolation,
  type ActionResult,
} from "@/lib/action-helpers";
import { actorName, requireSession } from "@/lib/auth-helpers";

export type CreateListResult = { ok: true; id: number } | { ok: false; message: string };

/**
 * Attribute a change to a list's contents (members or rules) on the parent list, so
 * every mutation carries who/when — same contract as createList/updateList.
 */
async function touchList(listId: number, by: string): Promise<void> {
  await db
    .update(distributionLists)
    .set({ updatedBy: by, updatedAt: new Date() })
    .where(eq(distributionLists.id, listId));
}

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
  const session = await requireSession();
  const by = actorName(session);
  const parsed = listSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    const [row] = await db
      .insert(distributionLists)
      .values({ ...parsed.data, updatedBy: by })
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
  const session = await requireSession();
  const by = actorName(session);
  const parsed = listSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    await db
      .update(distributionLists)
      .set({ ...parsed.data, updatedBy: by, updatedAt: new Date() })
      .where(eq(distributionLists.id, id));
  } catch (err) {
    if (isUniqueViolation(err))
      return { ok: false, message: "Ein Verteiler mit diesem Namen existiert bereits." };
    throw err;
  }
  revalidatePath("/verteiler");
  // Manual memberships also drive the Verteiler badges and list filter on "/", and the
  // office-rule chips on /stammdaten carry the list name.
  revalidatePath("/");
  revalidatePath("/stammdaten");
  return { ok: true };
}

export async function deleteList(id: number): Promise<ActionResult> {
  await requireSession();
  // Memberships cascade via the distribution_list_members FK (onDelete: cascade).
  await db.delete(distributionLists).where(eq(distributionLists.id, id));
  revalidatePath("/verteiler");
  // Manual memberships also drive the Verteiler badges and list filter on "/", and the
  // office-rule chips on /stammdaten reference the (now removed) list.
  revalidatePath("/");
  revalidatePath("/stammdaten");
  return { ok: true };
}

/** Add persons to a list; duplicates are ignored so re-adding is harmless. */
export async function addMembers(listId: number, personIds: number[]): Promise<ActionResult> {
  const session = await requireSession();
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
  await touchList(listId, actorName(session));
  revalidatePath("/verteiler");
  // Manual memberships also drive the Verteiler badges and list filter on "/".
  revalidatePath("/");
  return { ok: true };
}

export async function removeMember(listId: number, personId: number): Promise<ActionResult> {
  const session = await requireSession();
  await db
    .delete(distributionListMembers)
    .where(
      and(
        eq(distributionListMembers.listId, listId),
        eq(distributionListMembers.personId, personId),
      ),
    );
  await touchList(listId, actorName(session));
  revalidatePath("/verteiler");
  // Manual memberships also drive the Verteiler badges and list filter on "/".
  revalidatePath("/");
  return { ok: true };
}

/**
 * Rules (office/rank/group) change the effective membership of a list, so they
 * affect the Verteiler detail, the directory table filter and the Ämter page alike.
 */
function revalidateEffectiveMembership() {
  revalidatePath("/verteiler");
  revalidatePath("/");
  revalidatePath("/stammdaten");
}

/** Bind an office to a list: whoever holds it is then an automatic member. Idempotent. */
export async function addOfficeRule(listId: number, officeId: number): Promise<ActionResult> {
  const session = await requireSession();
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
  await touchList(listId, actorName(session));
  revalidateEffectiveMembership();
  return { ok: true };
}

/** Remove an office rule from a list. The office holders are no longer auto-included. */
export async function removeOfficeRule(listId: number, officeId: number): Promise<ActionResult> {
  const session = await requireSession();
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
  await touchList(listId, actorName(session));
  revalidateEffectiveMembership();
  return { ok: true };
}

/** Bind a Stand to a list: everyone carrying it is then an automatic member. Idempotent. */
export async function addRankRule(listId: number, rankId: number): Promise<ActionResult> {
  const session = await requireSession();
  if (!Number.isInteger(listId) || listId <= 0)
    return { ok: false, message: "Ungültiger Verteiler." };
  if (!Number.isInteger(rankId) || rankId <= 0)
    return { ok: false, message: "Ungültiger Stand." };
  try {
    await db.insert(distributionListRankRules).values({ listId, rankId }).onConflictDoNothing();
  } catch (err) {
    if (isForeignKeyViolation(err))
      return {
        ok: false,
        message: "Verteiler oder Stand existiert nicht mehr. Bitte Seite neu laden.",
      };
    throw err;
  }
  await touchList(listId, actorName(session));
  revalidateEffectiveMembership();
  return { ok: true };
}

/** Remove a rank rule from a list. Persons carrying that Stand are no longer auto-included. */
export async function removeRankRule(listId: number, rankId: number): Promise<ActionResult> {
  const session = await requireSession();
  if (!Number.isInteger(listId) || listId <= 0 || !Number.isInteger(rankId) || rankId <= 0)
    return { ok: false, message: "Ungültige Auswahl." };
  await db
    .delete(distributionListRankRules)
    .where(
      and(
        eq(distributionListRankRules.listId, listId),
        eq(distributionListRankRules.rankId, rankId),
      ),
    );
  await touchList(listId, actorName(session));
  revalidateEffectiveMembership();
  return { ok: true };
}

/** Bind a Gliederung to a list: everyone actively assigned to it is an automatic member. Idempotent. */
export async function addGroupRule(listId: number, groupId: number): Promise<ActionResult> {
  const session = await requireSession();
  if (!Number.isInteger(listId) || listId <= 0)
    return { ok: false, message: "Ungültiger Verteiler." };
  if (!Number.isInteger(groupId) || groupId <= 0)
    return { ok: false, message: "Ungültige Gliederung." };
  try {
    await db.insert(distributionListGroupRules).values({ listId, groupId }).onConflictDoNothing();
  } catch (err) {
    if (isForeignKeyViolation(err))
      return {
        ok: false,
        message: "Verteiler oder Gliederung existiert nicht mehr. Bitte Seite neu laden.",
      };
    throw err;
  }
  await touchList(listId, actorName(session));
  revalidateEffectiveMembership();
  return { ok: true };
}

/** Remove a group rule from a list. Members of that Gliederung are no longer auto-included. */
export async function removeGroupRule(listId: number, groupId: number): Promise<ActionResult> {
  const session = await requireSession();
  if (!Number.isInteger(listId) || listId <= 0 || !Number.isInteger(groupId) || groupId <= 0)
    return { ok: false, message: "Ungültige Auswahl." };
  await db
    .delete(distributionListGroupRules)
    .where(
      and(
        eq(distributionListGroupRules.listId, listId),
        eq(distributionListGroupRules.groupId, groupId),
      ),
    );
  await touchList(listId, actorName(session));
  revalidateEffectiveMembership();
  return { ok: true };
}
