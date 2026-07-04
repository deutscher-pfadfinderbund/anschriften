// Data model for the Bundesanschriftenverzeichnis (M2 / issue #2).
// Conventions: integer identity PKs, snake_case columns, timestamptz for audit timestamps.
// Normalised only where dropdowns, hierarchy or n:m relations require it; `persons` stays flat.
// better-auth tables live in a separate schema file and are owned by another milestone.
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/** Top-level organisational branch. Drives PDF ordering and grouping. */
export const sectionEnum = pgEnum("section", [
  "bund",
  "jungenbund",
  "maedchenbund",
  "orden_st_georg",
  "orden_st_christophorus",
  "bundesgilde",
]);

/** Outcome of a mail send (optional mail module, issue #19). */
export const mailStatusEnum = pgEnum("mail_status", ["sent", "failed"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Stände / ranks (Wölfling … Späher, Gildin …, Ordensränge). Lookup for `persons.rank_id`. */
export const ranks = pgTable("ranks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

/**
 * Every Gliederung lives here, including Älterengemeinschaften (Orden/Gilde) and their
 * Konvente/Kollegien. Self-referencing tree via `parent_id`. `sort_key` replaces the old
 * "NNN" prefix of the Access `Hilfsgruppe` column and steers PDF ordering.
 */
export const groups = pgTable("groups", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  parentId: integer("parent_id").references((): AnyPgColumn => groups.id),
  section: sectionEnum("section").notNull(),
  kind: text("kind"),
  sortKey: integer("sort_key").notNull().default(0),
  ...timestamps,
});

/** Ämter lookup. m/w variants are separate rows. `rank` orders offices within a group in the PDF. */
export const offices = pgTable("offices", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  rank: integer("rank").notNull().default(999),
  ...timestamps,
});

/** Flat person record. `legacy_id` keeps import idempotent against the Access source. */
export const persons = pgTable("persons", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  legacyId: text("legacy_id").unique(),
  salutation: text("salutation"),
  title: text("title"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  scoutName: text("scout_name"),
  birthDate: date("birth_date"),
  deathDate: date("death_date"),
  rankId: integer("rank_id").references(() => ranks.id),
  street: text("street"),
  addressExtra: text("address_extra"),
  postalCode: text("postal_code"),
  city: text("city"),
  email: text("email"),
  phones: jsonb("phones")
    .$type<{ label: string; number: string }[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  notes: text("notes"),
  doNotPrint: boolean("do_not_print").notNull().default(false),
  updatedBy: text("updated_by"),
  ...timestamps,
});

/**
 * Person ↔ Gliederung ↔ Amt. `office_id` NULL means membership without an office
 * (e.g. plain Bundesgilde member). Replaces the old comma-separated `Amt` free-text
 * field and the Älterengemeinschaft/Ordensgruppe/Ordensamt triple.
 *
 * Amtszeiten (issue #22): `start_date` = "seit" (NULL = unknown); `end_date` NULL =
 * currently active, set = ended tenure kept for the office history. All consumers
 * (table, PDF, distribution rules, mail) only ever see active rows; the delete guard
 * counts all rows so the FK never breaks. The same (person, group, office) may recur
 * across history, but only one row may be active at a time — enforced by a PARTIAL
 * unique index `WHERE end_date IS NULL` (see migration 0003; hand-written because
 * drizzle's uniqueIndex builder cannot emit `NULLS NOT DISTINCT`, needed so two active
 * office-less memberships of the same group still collide).
 *
 * `end_unknown` (issue #26): pure display flag for tenures whose end nobody remembers.
 * When set, `end_date` is filled with the *recording date* (documented upper bound —
 * "was over by then at the latest") and the UI renders "… – ?"/"Ende unbekannt". The
 * active marker stays `end_date IS NULL`, so no active filter (PDF, rules, mail, table)
 * changes: an "Ende unbekannt" row is a finished tenure like any other.
 */
export const assignments = pgTable(
  "assignments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    personId: integer("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id),
    officeId: integer("office_id").references(() => offices.id),
    startDate: date("start_date"),
    endDate: date("end_date"),
    endUnknown: boolean("end_unknown").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("assignments_active_person_group_office_key")
      .on(t.personId, t.groupId, t.officeId)
      .where(sql`${t.endDate} is null`),
  ],
);

/** Manually maintained mailing lists (the old Bool flags: Bundesrat, Bundesthing, …). */
export const distributionLists = pgTable("distribution_lists", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  description: text("description"),
  ...timestamps,
});

export const distributionListMembers = pgTable(
  "distribution_list_members",
  {
    listId: integer("list_id")
      .notNull()
      .references(() => distributionLists.id, { onDelete: "cascade" }),
    personId: integer("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.personId] })],
);

/**
 * Office-based membership rules: a list automatically contains whoever currently
 * holds one of the listed offices. Effective membership = manual members ∪ persons
 * assigned to a rule office (living only). Rules are maintained by the Kanzlei;
 * the import only ever writes manual memberships.
 */
export const distributionListOfficeRules = pgTable(
  "distribution_list_office_rules",
  {
    listId: integer("list_id")
      .notNull()
      .references(() => distributionLists.id, { onDelete: "cascade" }),
    officeId: integer("office_id")
      .notNull()
      .references(() => offices.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.officeId] })],
);

/**
 * Send log for the optional mail module (issue #19). One row per sent mailing
 * (not per BCC chunk). `list_id` is nullable and SET NULL on delete: a mailing
 * sent to a table selection has no list, and deleting a list must not erase its
 * history. Plaintext bodies are intentionally not stored.
 */
export const mailLog = pgTable("mail_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  sentBy: text("sent_by").notNull(),
  listId: integer("list_id").references(() => distributionLists.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  recipientCount: integer("recipient_count").notNull(),
  status: mailStatusEnum("status").notNull(),
  error: text("error"),
});

// --- Relations (for query-time joins in later milestones) ---

export const ranksRelations = relations(ranks, ({ many }) => ({
  persons: many(persons),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  parent: one(groups, {
    fields: [groups.parentId],
    references: [groups.id],
    relationName: "group_tree",
  }),
  children: many(groups, { relationName: "group_tree" }),
  assignments: many(assignments),
}));

export const officesRelations = relations(offices, ({ many }) => ({
  assignments: many(assignments),
  officeRules: many(distributionListOfficeRules),
}));

export const personsRelations = relations(persons, ({ one, many }) => ({
  rank: one(ranks, { fields: [persons.rankId], references: [ranks.id] }),
  assignments: many(assignments),
  distributionListMembers: many(distributionListMembers),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  person: one(persons, { fields: [assignments.personId], references: [persons.id] }),
  group: one(groups, { fields: [assignments.groupId], references: [groups.id] }),
  office: one(offices, { fields: [assignments.officeId], references: [offices.id] }),
}));

export const distributionListsRelations = relations(distributionLists, ({ many }) => ({
  members: many(distributionListMembers),
  officeRules: many(distributionListOfficeRules),
  mailLog: many(mailLog),
}));

export const mailLogRelations = relations(mailLog, ({ one }) => ({
  list: one(distributionLists, {
    fields: [mailLog.listId],
    references: [distributionLists.id],
  }),
}));

export const distributionListMembersRelations = relations(distributionListMembers, ({ one }) => ({
  list: one(distributionLists, {
    fields: [distributionListMembers.listId],
    references: [distributionLists.id],
  }),
  person: one(persons, {
    fields: [distributionListMembers.personId],
    references: [persons.id],
  }),
}));

export const distributionListOfficeRulesRelations = relations(
  distributionListOfficeRules,
  ({ one }) => ({
    list: one(distributionLists, {
      fields: [distributionListOfficeRules.listId],
      references: [distributionLists.id],
    }),
    office: one(offices, {
      fields: [distributionListOfficeRules.officeId],
      references: [offices.id],
    }),
  }),
);
