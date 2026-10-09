"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { rankDeleteBlockers } from "@/db/queries";
import { ranks } from "@/db/schema";
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
  type ActionResult,
} from "@/lib/action-helpers";
import { actorName } from "@/lib/auth-helpers";

const rankSchema = z.object({
  name: nameField,
  sortOrder: orderNumber("Die Sortierung"),
});

export type RankInput = z.input<typeof rankSchema>;

/** Create (`id` null) or update a Stand. */
export async function saveRank(id: number | null, raw: RankInput): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return SESSION_EXPIRED;
  const parsed = rankSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const values = { ...parsed.data, updatedBy: actorName(session), updatedAt: new Date() };
  try {
    const saved =
      id == null
        ? await db.insert(ranks).values(values).returning({ id: ranks.id })
        : await db.update(ranks).set(values).where(eq(ranks.id, id)).returning({ id: ranks.id });
    if (saved.length === 0) return { ok: false, message: deletedMeanwhile("Dieser Stand") };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "Ein Stand mit diesem Namen existiert bereits." };
    throw err;
  }
  revalidateApp();
  return { ok: true };
}

export async function deleteRank(id: number): Promise<ActionResult> {
  if (!(await getActionSession())) return SESSION_EXPIRED;
  // Same guard as the page's up-front check (persons with this Stand, Verteiler rules).
  const blocker = (await rankDeleteBlockers()).get(id);
  if (blocker) return { ok: false, message: blocker };
  try {
    await db.delete(ranks).where(eq(ranks.id, id));
  } catch (err) {
    // Race: a person got this rank between the check above and the delete.
    if (isForeignKeyViolation(err))
      return { ok: false, message: "Dieser Stand wird inzwischen verwendet und kann nicht gelöscht werden." };
    throw err;
  }
  revalidateApp();
  return { ok: true };
}
