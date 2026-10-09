"use server";

import { count, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { distributionListRankRules, persons, ranks } from "@/db/schema";
import {
  firstError,
  getActionSession,
  isForeignKeyViolation,
  isUniqueViolation,
  revalidateApp,
  SESSION_EXPIRED,
  type ActionResult,
} from "@/lib/action-helpers";
import { actorName } from "@/lib/auth-helpers";

const rankSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich."),
  sortOrder: z.number().int().min(0, "Sortierung muss ≥ 0 sein."),
});

export type RankInput = z.infer<typeof rankSchema>;

export async function createRank(raw: RankInput): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return SESSION_EXPIRED;
  const by = actorName(session);
  const parsed = rankSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    await db.insert(ranks).values({ ...parsed.data, updatedBy: by });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "Ein Stand mit diesem Namen existiert bereits." };
    throw err;
  }
  revalidateApp();
  return { ok: true };
}

export async function updateRank(id: number, raw: RankInput): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return SESSION_EXPIRED;
  const by = actorName(session);
  const parsed = rankSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    await db.update(ranks).set({ ...parsed.data, updatedBy: by, updatedAt: new Date() }).where(eq(ranks.id, id));
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "Ein Stand mit diesem Namen existiert bereits." };
    throw err;
  }
  revalidateApp();
  return { ok: true };
}

export async function deleteRank(id: number): Promise<ActionResult> {
  if (!(await getActionSession())) return SESSION_EXPIRED;
  const [{ n }] = await db
    .select({ n: count() })
    .from(persons)
    .where(eq(persons.rankId, id));
  if (Number(n) > 0)
    return { ok: false, message: "Stand ist noch Personen zugeordnet und kann nicht gelöscht werden." };
  // Distribution-list rank rules reference the rank with onDelete: cascade — deleting
  // it would silently drop the rules and change who gets future mailings, so block it here.
  const [{ n: rules }] = await db
    .select({ n: count() })
    .from(distributionListRankRules)
    .where(eq(distributionListRankRules.rankId, id));
  if (Number(rules) > 0)
    return { ok: false, message: "Stand wird von Verteiler-Regeln verwendet und kann nicht gelöscht werden." };
  try {
    await db.delete(ranks).where(eq(ranks.id, id));
  } catch (err) {
    // Race: a person got this rank between the check above and the delete.
    if (isForeignKeyViolation(err))
      return { ok: false, message: "Stand wird inzwischen verwendet und kann nicht gelöscht werden." };
    throw err;
  }
  revalidateApp();
  return { ok: true };
}
