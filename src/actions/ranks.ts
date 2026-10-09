"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { rankDeleteBlockers } from "@/db/queries";
import { ranks } from "@/db/schema";
import {
  dbFailure,
  deletedMeanwhile,
  firstError,
  guardedDelete,
  mutation,
  nameField,
  orderNumber,
  stamp,
  type ActionResult,
} from "@/lib/action-helpers";

const rankSchema = z.object({
  name: nameField,
  sortOrder: orderNumber("Die Reihenfolge"),
});

export type RankInput = z.input<typeof rankSchema>;

/** Create (`id` null) or update a Stand. */
export async function saveRank(id: number | null, raw: RankInput): Promise<ActionResult> {
  return mutation(async (by) => {
    const parsed = rankSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const values = { ...parsed.data, ...stamp(by) };
    try {
      const saved =
        id == null
          ? await db.insert(ranks).values(values).returning({ id: ranks.id })
          : await db.update(ranks).set(values).where(eq(ranks.id, id)).returning({ id: ranks.id });
      return saved.length > 0 ? { ok: true } : { ok: false, message: deletedMeanwhile("Dieser Stand") };
    } catch (err) {
      return dbFailure(err, { unique: "Ein Stand mit diesem Namen gibt es schon." });
    }
  });
}

export async function deleteRank(id: number): Promise<ActionResult> {
  return mutation(() =>
    guardedDelete(id, rankDeleteBlockers, () => db.delete(ranks).where(eq(ranks.id, id)), "Dieser Stand"),
  );
}
