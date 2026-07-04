"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { assignments, groups } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";

export type ActionResult = { ok: true } | { ok: false; message: string };

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

function firstError(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Ungültige Eingabe.";
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}

export async function createGroup(raw: GroupInput): Promise<ActionResult> {
  await requireSession();
  const parsed = groupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    await db.insert(groups).values(parsed.data);
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "Eine Gliederung mit diesem Namen existiert bereits." };
    throw err;
  }
  revalidatePath("/gliederungen");
  revalidatePath("/");
  return { ok: true };
}

export async function updateGroup(id: number, raw: GroupInput): Promise<ActionResult> {
  await requireSession();
  const parsed = groupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  if (parsed.data.parentId === id) return { ok: false, message: "Eine Gliederung kann nicht ihr eigenes Elternteil sein." };
  try {
    await db.update(groups).set(parsed.data).where(eq(groups.id, id));
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
    return { ok: false, message: "Gliederung ist noch Personen zugeordnet und kann nicht gelöscht werden." };

  await db.delete(groups).where(eq(groups.id, id));
  revalidatePath("/gliederungen");
  revalidatePath("/");
  return { ok: true };
}
