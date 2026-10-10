"use server";

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { db, type Tx } from "@/db";
import { logMemberships } from "@/db/audit";
import { RULE_TABLES } from "@/db/list-rules";
import { distributionListMembers, distributionLists, persons } from "@/db/schema";
import {
  dbFailure,
  deletedMeanwhile,
  firstError,
  mutation,
  nameField,
  stamp,
  type ActionResult,
} from "@/lib/action-helpers";
import { parseId } from "@/lib/ids";
import { DESCRIPTION_MAX } from "@/lib/limits";
import { optText } from "@/lib/person-schema";
import { RULE_KIND_LABELS, RULE_KINDS, type RuleKind } from "@/lib/rule-kinds";

type SaveListResult = { ok: true; id: number } | { ok: false; message: string };

type AddMembersResult =
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
async function touchList(listId: number, by: string, q: Tx | typeof db = db): Promise<void> {
  await q.update(distributionLists).set(stamp(by)).where(eq(distributionLists.id, listId));
}

/**
 * Record a change to manual memberships on the persons concerned: bump them and log it.
 * The person editor saves memberships as part of the person, so an editor opened before
 * this change then refuses to save (its concurrency token is the person's `updatedAt`)
 * instead of silently undoing it.
 */
async function touchMembers(tx: Tx, listId: number, ids: number[], by: string, added: boolean): Promise<void> {
  if (ids.length === 0) return;
  await tx.update(persons).set(stamp(by)).where(inArray(persons.id, ids));
  await logMemberships(tx, listId, ids, by, added);
}

const listSchema = z.object({
  name: nameField,
  description: optText(DESCRIPTION_MAX),
});

type ListInput = z.input<typeof listSchema>;

/** Create (`id` null) or rename/describe a list. Returns the id so the UI can select it. */
export async function saveList(id: number | null, raw: ListInput): Promise<SaveListResult> {
  return mutation(async (by) => {
    const parsed = listSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const values = { ...parsed.data, ...stamp(by) };
    try {
      const [row] =
        id == null
          ? await db.insert(distributionLists).values(values).returning({ id: distributionLists.id })
          : await db
              .update(distributionLists)
              .set(values)
              .where(eq(distributionLists.id, id))
              .returning({ id: distributionLists.id });
      return row ? { ok: true, id: row.id } : { ok: false, message: deletedMeanwhile("Dieser Verteiler") };
    } catch (err) {
      return dbFailure(err, { unique: "Einen Verteiler mit diesem Namen gibt es schon." });
    }
  });
}

export async function deleteList(id: number): Promise<ActionResult> {
  return mutation(async () => {
    // Memberships and rules cascade; the mail log keeps its rows (list_id → NULL).
    await db.delete(distributionLists).where(eq(distributionLists.id, id));
    return { ok: true };
  });
}

/**
 * Add persons to a list; duplicates are ignored so re-adding is harmless. Deceased persons
 * are left out: effective membership never counts them, so adding them would report a
 * success that never shows up on the list.
 */
export async function addMembers(listId: number, personIds: number[]): Promise<AddMembersResult> {
  return mutation(async (by) => {
    const requested = [...new Set(personIds.map(parseId).filter((id) => id != null))];
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
      await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(distributionListMembers)
          .values(ids.map((personId) => ({ listId, personId })))
          .onConflictDoNothing()
          .returning({ personId: distributionListMembers.personId });
        await touchList(listId, by, tx);
        // Only who was not on the list yet is a change.
        await touchMembers(tx, listId, inserted.map((r) => r.personId), by, true);
      });
    } catch (err) {
      // Race: the list or a person was deleted between page load and this call.
      return dbFailure(err, { fk: `Verteiler oder Person existiert nicht mehr. ${RELOAD}` });
    }
    return { ok: true, added: ids.length, skippedDeceased: deceased.size };
  });
}

export async function removeMember(listId: number, personId: number): Promise<ActionResult> {
  return mutation(async (by) => {
    await db.transaction(async (tx) => {
      const removed = await tx
        .delete(distributionListMembers)
        .where(and(eq(distributionListMembers.listId, listId), eq(distributionListMembers.personId, personId)))
        .returning({ personId: distributionListMembers.personId });
      await touchList(listId, by, tx);
      await touchMembers(tx, listId, removed.map((r) => r.personId), by, false);
    });
    return { ok: true };
  });
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
  return mutation(async (by) => {
    const parsed = ruleSchema.safeParse({ listId, kind, targetId });
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const rule = parsed.data;
    try {
      await RULE_TABLES[rule.kind].insert(rule.listId, rule.targetId);
    } catch (err) {
      // Race: the list or the target was deleted between page load and this call.
      return dbFailure(err, { fk: `Verteiler oder ${RULE_KIND_LABELS[rule.kind]} existiert nicht mehr. ${RELOAD}` });
    }
    await touchList(rule.listId, by);
    return { ok: true };
  });
}

/** Remove a rule from a list. Persons it matched are no longer auto-included. */
export async function removeListRule(listId: number, kind: RuleKind, targetId: number): Promise<ActionResult> {
  return mutation(async (by) => {
    const parsed = ruleSchema.safeParse({ listId, kind, targetId });
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const rule = parsed.data;
    const t = RULE_TABLES[rule.kind];
    await db.delete(t.rules).where(and(eq(t.rules.listId, rule.listId), eq(t.ruleTarget, rule.targetId)));
    await touchList(rule.listId, by);
    return { ok: true };
  });
}
