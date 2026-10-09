"use server";

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { RULE_TABLES } from "@/db/list-rules";
import { distributionListMembers, distributionLists, persons } from "@/db/schema";
import {
  deletedMeanwhile,
  firstError,
  getActionSession,
  isForeignKeyViolation,
  isUniqueViolation,
  revalidateApp,
  SESSION_EXPIRED,
  type ActionResult,
} from "@/lib/action-helpers";
import { actorName } from "@/lib/auth-helpers";
import { RULE_KIND_LABELS, RULE_KINDS, type RuleKind } from "@/lib/rule-kinds";

export type SaveListResult = { ok: true; id: number } | { ok: false; message: string };

export type AddMembersResult =
  | {
      ok: true;
      /** Living persons now on the list (including ones that already were). */
      added: number;
      /** Deceased persons that were left out. */
      skippedDeceased: number;
    }
  | { ok: false; message: string };

const RELOAD = "Bitte lade die Seite neu.";

/**
 * Attribute a change to a list's contents (members or rules) on the parent list, so
 * every mutation carries who/when.
 */
async function touchList(listId: number, by: string): Promise<void> {
  await db
    .update(distributionLists)
    .set({ updatedBy: by, updatedAt: new Date() })
    .where(eq(distributionLists.id, listId));
}

const listSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name ist erforderlich.")
    .max(200, "Eingabe ist zu lang (max. 200 Zeichen)."),
  description: z
    .string()
    .trim()
    .max(2000, "Eingabe ist zu lang (max. 2000 Zeichen).")
    .nullish()
    .transform((v) => v || null),
});

export type ListInput = z.input<typeof listSchema>;

/** Create (`id` null) or rename/describe a list. Returns the id so the UI can select it. */
export async function saveList(id: number | null, raw: ListInput): Promise<SaveListResult> {
  const session = await getActionSession();
  if (!session) return SESSION_EXPIRED;
  const parsed = listSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const values = { ...parsed.data, updatedBy: actorName(session), updatedAt: new Date() };
  let savedId: number | undefined;
  try {
    const [row] =
      id == null
        ? await db.insert(distributionLists).values(values).returning({ id: distributionLists.id })
        : await db
            .update(distributionLists)
            .set(values)
            .where(eq(distributionLists.id, id))
            .returning({ id: distributionLists.id });
    savedId = row?.id;
  } catch (err) {
    if (isUniqueViolation(err))
      return { ok: false, message: "Ein Verteiler mit diesem Namen existiert bereits." };
    throw err;
  }
  if (savedId == null) return { ok: false, message: deletedMeanwhile("Dieser Verteiler") };
  revalidateApp();
  return { ok: true, id: savedId };
}

export async function deleteList(id: number): Promise<ActionResult> {
  if (!(await getActionSession())) return SESSION_EXPIRED;
  // Memberships and rules cascade; the mail log keeps its rows (list_id → NULL).
  await db.delete(distributionLists).where(eq(distributionLists.id, id));
  revalidateApp();
  return { ok: true };
}

/**
 * Add persons to a list; duplicates are ignored so re-adding is harmless. Deceased persons
 * are left out: effective membership never counts them, so adding them would report a
 * success that never shows up on the list.
 */
export async function addMembers(listId: number, personIds: number[]): Promise<AddMembersResult> {
  const session = await getActionSession();
  if (!session) return SESSION_EXPIRED;
  const requested = [...new Set(personIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (requested.length === 0) return { ok: true, added: 0, skippedDeceased: 0 };
  const deceased = new Set(
    (
      await db
        .select({ id: persons.id })
        .from(persons)
        .where(and(inArray(persons.id, requested), isNotNull(persons.deathDate)))
    ).map((p) => p.id),
  );
  const ids = requested.filter((id) => !deceased.has(id));
  if (ids.length === 0)
    return { ok: false, message: "Verstorbene Personen können keinem Verteiler hinzugefügt werden." };
  try {
    await db
      .insert(distributionListMembers)
      .values(ids.map((personId) => ({ listId, personId })))
      .onConflictDoNothing();
  } catch (err) {
    // Race: the list or a person was deleted between page load and this call.
    if (isForeignKeyViolation(err))
      return { ok: false, message: `Verteiler oder Person existiert nicht mehr. ${RELOAD}` };
    throw err;
  }
  await touchList(listId, actorName(session));
  revalidateApp();
  return { ok: true, added: ids.length, skippedDeceased: deceased.size };
}

export async function removeMember(listId: number, personId: number): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return SESSION_EXPIRED;
  await db
    .delete(distributionListMembers)
    .where(and(eq(distributionListMembers.listId, listId), eq(distributionListMembers.personId, personId)));
  await touchList(listId, actorName(session));
  revalidateApp();
  return { ok: true };
}

// --- automatic rules (Amt / Stand / Gliederung, see src/lib/rule-kinds.ts) -----------

const ruleSchema = z.object({
  listId: z.number().int().positive("Ungültiger Verteiler."),
  kind: z.enum(RULE_KINDS),
  targetId: z.number().int().positive("Ungültige Auswahl."),
});

/**
 * Bind an Amt, Stand or Gliederung to a list: whoever actively holds / carries / belongs
 * to it is then an automatic member. Idempotent.
 */
export async function addListRule(listId: number, kind: RuleKind, targetId: number): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return SESSION_EXPIRED;
  const parsed = ruleSchema.safeParse({ listId, kind, targetId });
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const rule = parsed.data;
  try {
    await RULE_TABLES[rule.kind].insert(rule.listId, rule.targetId);
  } catch (err) {
    // Race: the list or the target was deleted between page load and this call.
    if (isForeignKeyViolation(err))
      return {
        ok: false,
        message: `Verteiler oder ${RULE_KIND_LABELS[rule.kind]} existiert nicht mehr. ${RELOAD}`,
      };
    throw err;
  }
  await touchList(rule.listId, actorName(session));
  revalidateApp();
  return { ok: true };
}

/** Remove a rule from a list. Persons it matched are no longer auto-included. */
export async function removeListRule(listId: number, kind: RuleKind, targetId: number): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return SESSION_EXPIRED;
  const parsed = ruleSchema.safeParse({ listId, kind, targetId });
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const rule = parsed.data;
  const t = RULE_TABLES[rule.kind];
  await db.delete(t.rules).where(and(eq(t.rules.listId, rule.listId), eq(t.ruleTarget, rule.targetId)));
  await touchList(rule.listId, actorName(session));
  revalidateApp();
  return { ok: true };
}
