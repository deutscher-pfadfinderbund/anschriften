"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { officeDeleteBlockers } from "@/db/queries";
import { offices } from "@/db/schema";
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

const officeSchema = z.object({
  name: nameField,
  // RANK_UNRANKED (999) is the "ohne Reihenfolge" sentinel and passes like any other value.
  rank: orderNumber("Die Reihenfolge"),
});

export type OfficeInput = z.input<typeof officeSchema>;

/** Create (`id` null) or update an Amt. */
export async function saveOffice(id: number | null, raw: OfficeInput): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return SESSION_EXPIRED;
  const parsed = officeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const values = { ...parsed.data, updatedBy: actorName(session), updatedAt: new Date() };
  try {
    const saved =
      id == null
        ? await db.insert(offices).values(values).returning({ id: offices.id })
        : await db.update(offices).set(values).where(eq(offices.id, id)).returning({ id: offices.id });
    if (saved.length === 0) return { ok: false, message: deletedMeanwhile("Dieses Amt") };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "Ein Amt mit diesem Namen gibt es schon." };
    throw err;
  }
  revalidateApp();
  return { ok: true };
}

export async function deleteOffice(id: number): Promise<ActionResult> {
  if (!(await getActionSession())) return SESSION_EXPIRED;
  // Same guard as the page's up-front check (assignments incl. history, Verteiler rules).
  const blocker = (await officeDeleteBlockers()).get(id);
  if (blocker) return { ok: false, message: blocker };
  try {
    await db.delete(offices).where(eq(offices.id, id));
  } catch (err) {
    // Race: an assignment appeared between the check above and the delete.
    if (isForeignKeyViolation(err))
      return { ok: false, message: "Dieses Amt wird inzwischen verwendet und kann nicht gelöscht werden." };
    throw err;
  }
  revalidateApp();
  return { ok: true };
}
