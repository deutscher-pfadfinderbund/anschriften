"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { officeDeleteBlockers } from "@/db/queries";
import { offices } from "@/db/schema";
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

const officeSchema = z.object({
  name: nameField,
  // RANK_UNRANKED (999) is the "ohne Reihenfolge" sentinel and passes like any other value.
  rank: orderNumber("Die Reihenfolge"),
});

export type OfficeInput = z.input<typeof officeSchema>;

/** Create (`id` null) or update an Amt. */
export async function saveOffice(id: number | null, raw: OfficeInput): Promise<ActionResult> {
  return mutation(async (by) => {
    const parsed = officeSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const values = { ...parsed.data, ...stamp(by) };
    try {
      const saved =
        id == null
          ? await db.insert(offices).values(values).returning({ id: offices.id })
          : await db.update(offices).set(values).where(eq(offices.id, id)).returning({ id: offices.id });
      return saved.length > 0 ? { ok: true } : { ok: false, message: deletedMeanwhile("Dieses Amt") };
    } catch (err) {
      return dbFailure(err, { unique: "Ein Amt mit diesem Namen gibt es schon." });
    }
  });
}

export async function deleteOffice(id: number): Promise<ActionResult> {
  return mutation(() =>
    guardedDelete(id, officeDeleteBlockers, () => db.delete(offices).where(eq(offices.id, id)), "Dieses Amt"),
  );
}
