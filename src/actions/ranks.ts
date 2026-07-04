"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { persons, ranks } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";

export type ActionResult = { ok: true } | { ok: false; message: string };

const rankSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich."),
  sortOrder: z.number().int().min(0, "Sortierung muss ≥ 0 sein."),
});

export type RankInput = z.infer<typeof rankSchema>;

function firstError(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Ungültige Eingabe.";
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}

export async function createRank(raw: RankInput): Promise<ActionResult> {
  await requireSession();
  const parsed = rankSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    await db.insert(ranks).values(parsed.data);
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "Ein Stand mit diesem Namen existiert bereits." };
    throw err;
  }
  revalidatePath("/stammdaten");
  revalidatePath("/");
  return { ok: true };
}

export async function updateRank(id: number, raw: RankInput): Promise<ActionResult> {
  await requireSession();
  const parsed = rankSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    await db.update(ranks).set(parsed.data).where(eq(ranks.id, id));
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "Ein Stand mit diesem Namen existiert bereits." };
    throw err;
  }
  revalidatePath("/stammdaten");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteRank(id: number): Promise<ActionResult> {
  await requireSession();
  const [{ n }] = await db
    .select({ n: count() })
    .from(persons)
    .where(eq(persons.rankId, id));
  if (Number(n) > 0)
    return { ok: false, message: "Stand ist noch Personen zugeordnet und kann nicht gelöscht werden." };
  await db.delete(ranks).where(eq(ranks.id, id));
  revalidatePath("/stammdaten");
  revalidatePath("/");
  return { ok: true };
}
