"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { distributionListMembers, distributionLists } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";

export type ActionResult = { ok: true } | { ok: false; message: string };
export type CreateListResult = { ok: true; id: number } | { ok: false; message: string };

const listSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich."),
  description: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type ListInput = z.infer<typeof listSchema>;

function firstError(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Ungültige Eingabe.";
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

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
  return { ok: true };
}

export async function deleteList(id: number): Promise<ActionResult> {
  await requireSession();
  // Memberships cascade via the distribution_list_members FK (onDelete: cascade).
  await db.delete(distributionLists).where(eq(distributionLists.id, id));
  revalidatePath("/verteiler");
  return { ok: true };
}

/** Add persons to a list; duplicates are ignored so re-adding is harmless. */
export async function addMembers(listId: number, personIds: number[]): Promise<ActionResult> {
  await requireSession();
  const ids = [...new Set(personIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return { ok: true };
  await db
    .insert(distributionListMembers)
    .values(ids.map((personId) => ({ listId, personId })))
    .onConflictDoNothing();
  revalidatePath("/verteiler");
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
  return { ok: true };
}
