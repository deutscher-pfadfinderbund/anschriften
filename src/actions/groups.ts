"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { assignments, distributionListGroupRules, groups } from "@/db/schema";
import {
  firstError,
  isForeignKeyViolation,
  isUniqueViolation,
  type ActionResult,
} from "@/lib/action-helpers";
import { actorName, requireSession } from "@/lib/auth-helpers";

const SECTIONS = [
  "bund",
  "jungenbund",
  "maedchenbund",
  "orden_st_georg",
  "orden_st_christophorus",
  "bundesgilde",
] as const;

const groupSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich."),
  parentId: z.number().int().nullable(),
  section: z.enum(SECTIONS),
  kind: z
    .string()
    .trim()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  sortKey: z.number().int().min(0, "Sortierschlüssel muss ≥ 0 sein."),
});

export type GroupInput = z.infer<typeof groupSchema>;

export async function createGroup(raw: GroupInput): Promise<ActionResult> {
  const session = await requireSession();
  const by = actorName(session);
  const parsed = groupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    await db.insert(groups).values({ ...parsed.data, updatedBy: by });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "Eine Gliederung mit diesem Namen existiert bereits." };
    throw err;
  }
  revalidatePath("/gliederungen");
  revalidatePath("/");
  return { ok: true };
}

export async function updateGroup(id: number, raw: GroupInput): Promise<ActionResult> {
  const session = await requireSession();
  const by = actorName(session);
  const parsed = groupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  // Reject a parent that is the group itself or one of its descendants: such a cycle
  // would drop the whole branch from every view (list, comboboxes, filters) and could
  // not be repaired through the UI. Walk up from the proposed parent — cheap, a handful
  // of rows — and refuse if we reach this group.
  if (parsed.data.parentId != null) {
    const rows = await db.select({ id: groups.id, parentId: groups.parentId }).from(groups);
    const parentById = new Map(rows.map((r) => [r.id, r.parentId]));
    const seen = new Set<number>();
    let cursor: number | null = parsed.data.parentId;
    while (cursor != null) {
      if (cursor === id)
        return {
          ok: false,
          message: "Eine Gliederung kann nicht sich selbst oder einer ihrer Untergliederungen untergeordnet werden.",
        };
      if (seen.has(cursor)) break; // pre-existing cycle elsewhere — stop instead of looping
      seen.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
  }
  try {
    await db.update(groups).set({ ...parsed.data, updatedBy: by, updatedAt: new Date() }).where(eq(groups.id, id));
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "Eine Gliederung mit diesem Namen existiert bereits." };
    throw err;
  }
  revalidatePath("/gliederungen");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteGroup(id: number): Promise<ActionResult> {
  await requireSession();
  const [{ n: childCount }] = await db
    .select({ n: count() })
    .from(groups)
    .where(eq(groups.parentId, id));
  if (Number(childCount) > 0)
    return { ok: false, message: "Gliederung hat Untergliederungen und kann nicht gelöscht werden." };

  const [{ n: assignmentCount }] = await db
    .select({ n: count() })
    .from(assignments)
    .where(eq(assignments.groupId, id));
  if (Number(assignmentCount) > 0)
    return {
      ok: false,
      message:
        "Gliederung ist noch Personen zugeordnet (auch frühere Ämter in der Historie zählen) und kann nicht gelöscht werden.",
    };

  // Distribution-list group rules reference the group with onDelete: cascade — deleting
  // it would silently drop the rules and change who gets future mailings, so block it here.
  const [{ n: ruleCount }] = await db
    .select({ n: count() })
    .from(distributionListGroupRules)
    .where(eq(distributionListGroupRules.groupId, id));
  if (Number(ruleCount) > 0)
    return { ok: false, message: "Gliederung wird von Verteiler-Regeln verwendet und kann nicht gelöscht werden." };

  try {
    await db.delete(groups).where(eq(groups.id, id));
  } catch (err) {
    // Race: something referenced the group between the checks above and the delete.
    if (isForeignKeyViolation(err))
      return { ok: false, message: "Gliederung wird inzwischen verwendet und kann nicht gelöscht werden." };
    throw err;
  }
  revalidatePath("/gliederungen");
  revalidatePath("/");
  return { ok: true };
}
