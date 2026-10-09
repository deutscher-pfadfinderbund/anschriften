"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { groupDeleteBlockers } from "@/db/queries";
import { groups } from "@/db/schema";
import {
  deletedMeanwhile,
  firstError,
  getActionSession,
  isForeignKeyViolation,
  isUniqueViolation,
  nameField,
  orderNumber,
  revalidateApp,
  SESSION_EXPIRED,
  UserFacingError,
  type ActionResult,
} from "@/lib/action-helpers";
import { actorName } from "@/lib/auth-helpers";
import { descendantIds } from "@/lib/groups";
import { SECTIONS } from "@/lib/sections";

const groupSchema = z.object({
  name: nameField,
  parentId: z.number().int().positive().nullable(),
  // Only decisive for a top-level group: a child always takes its parent's Bereich.
  section: z.enum(SECTIONS, { error: "Bitte einen Bereich wählen." }),
  kind: z
    .string()
    .trim()
    .max(200, "Eingabe ist zu lang (max. 200 Zeichen).")
    .nullish()
    .transform((v) => v || null),
  sortKey: orderNumber("Die Reihenfolge"),
});

export type GroupInput = z.input<typeof groupSchema>;

/**
 * Create (`id` null) or update a Gliederung. The Bereich (section) is a property of the
 * whole branch: the PDF profiles walk the tree and drop every child outside the profile's
 * sections, so a child with a different Bereich than its parent would silently vanish
 * from "nur Orden St. Georg". Hence a child always inherits its parent's section, and
 * changing a group's section (or moving it) carries its whole subtree along — in one
 * transaction.
 */
export async function saveGroup(id: number | null, raw: GroupInput): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return SESSION_EXPIRED;
  const parsed = groupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const data = parsed.data;
  const by = actorName(session);

  try {
    await db.transaction(async (tx) => {
      // A handful of rows: load the tree once for the parent, cycle and subtree checks.
      const all = await tx
        .select({ id: groups.id, parentId: groups.parentId, section: groups.section })
        .from(groups);
      const subtree = id != null ? descendantIds(all, id) : new Set<number>();

      let section = data.section;
      if (data.parentId != null) {
        const parent = all.find((g) => g.id === data.parentId);
        if (!parent) throw new UserFacingError(deletedMeanwhile("Die übergeordnete Gliederung"));
        // A cycle would drop the whole branch from every view and could not be repaired
        // through the UI.
        if (data.parentId === id || subtree.has(data.parentId))
          throw new UserFacingError(
            "Eine Gliederung kann nicht sich selbst oder einer ihrer Untergliederungen untergeordnet werden.",
          );
        section = parent.section;
      }

      const values = { ...data, section, updatedBy: by, updatedAt: new Date() };
      if (id == null) {
        await tx.insert(groups).values(values);
        return;
      }
      const saved = await tx.update(groups).set(values).where(eq(groups.id, id)).returning({ id: groups.id });
      if (saved.length === 0) throw new UserFacingError(deletedMeanwhile("Diese Gliederung"));
      if (subtree.size > 0)
        await tx
          .update(groups)
          .set({ section, updatedBy: by, updatedAt: new Date() })
          .where(and(inArray(groups.id, [...subtree]), ne(groups.section, section)));
    });
  } catch (err) {
    if (err instanceof UserFacingError) return { ok: false, message: err.message };
    if (isUniqueViolation(err))
      return { ok: false, message: "Eine Gliederung mit diesem Namen gibt es schon." };
    // Race: the parent was deleted between the check above and the write.
    if (isForeignKeyViolation(err))
      return { ok: false, message: deletedMeanwhile("Die übergeordnete Gliederung") };
    throw err;
  }
  revalidateApp();
  return { ok: true };
}

export async function deleteGroup(id: number): Promise<ActionResult> {
  if (!(await getActionSession())) return SESSION_EXPIRED;
  // Same guard as the page's up-front check (children, assignments incl. history, rules).
  const blocker = (await groupDeleteBlockers()).get(id);
  if (blocker) return { ok: false, message: blocker };
  try {
    await db.delete(groups).where(eq(groups.id, id));
  } catch (err) {
    // Race: something referenced the group between the check above and the delete.
    if (isForeignKeyViolation(err))
      return { ok: false, message: "Diese Gliederung wird inzwischen verwendet und kann nicht gelöscht werden." };
    throw err;
  }
  revalidateApp();
  return { ok: true };
}
