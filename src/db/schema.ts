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
  unique,
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
    ...timestamps,
  },
  (t) => [
    unique("assignments_person_group_office_key")
      .on(t.personId, t.groupId, t.officeId)
      .nullsNotDistinct(),
  ],
);

/** Manually maintained mailing lists (the old Bool flags: Bundesrat, Bundesthing, …). */
export const distributionLists = pgTable("distribution_lists", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
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
