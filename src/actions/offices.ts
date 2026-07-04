"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { assignments, offices } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";

export type ActionResult = { ok: true } | { ok: false; message: string };

const officeSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich."),
  rank: z.number().int().min(0, "Rang muss ≥ 0 sein."),
});

export type OfficeInput = z.infer<typeof officeSchema>;

function firstError(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Ungültige Eingabe.";
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}

export async function createOffice(raw: OfficeInput): Promise<ActionResult> {
  await requireSession();
  const parsed = officeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    await db.insert(offices).values(parsed.data);
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "Ein Amt mit diesem Namen existiert bereits." };
    throw err;
  }
  revalidatePath("/stammdaten");
  revalidatePath("/");
  return { ok: true };
}

export async function updateOffice(id: number, raw: OfficeInput): Promise<ActionResult> {
  await requireSession();
  const parsed = officeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    await db.update(offices).set(parsed.data).where(eq(offices.id, id));
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "Ein Amt mit diesem Namen existiert bereits." };
    throw err;
  }
  revalidatePath("/stammdaten");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteOffice(id: number): Promise<ActionResult> {
  await requireSession();
  const [{ n }] = await db
    .select({ n: count() })
    .from(assignments)
    .where(eq(assignments.officeId, id));
  if (Number(n) > 0)
    return { ok: false, message: "Amt ist noch Personen zugeordnet und kann nicht gelöscht werden." };
  await db.delete(offices).where(eq(offices.id, id));
  revalidatePath("/stammdaten");
  revalidatePath("/");
  return { ok: true };
}
