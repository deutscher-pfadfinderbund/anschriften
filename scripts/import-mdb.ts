/**
 * Import the legacy Access address database into Postgres (issue #2).
 *
 *   npx tsx scripts/import-mdb.ts <path-to.mdb> [--dry-run]
 *
 * Reads the `Adressen` table via mdbtools (read-only), maps it onto the M2 schema and
 * upserts everything in a single transaction. Idempotent: persons are keyed on legacy_id,
 * their assignments and mailing-list memberships are deleted and recreated, and lookup
 * tables (groups/offices/ranks/lists) are get-or-created by name. --dry-run parses,
 * validates and prints statistics without writing.
 */
import { execFileSync } from "node:child_process";
import { parse } from "csv-parse/sync";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  assignments,
  distributionListMembers,
  distributionLists,
  groups,
  offices,
  persons,
  ranks,
} from "../src/db/schema";
import {
  buildGroupChain,
  buildPhones,
  deriveKind,
  DISTRIBUTION_LISTS,
  isUnknownRank,
  normalizeAelterengemeinschaft,
  parseBool,
  parseDate,
  parseHilfsgruppe,
  rankForOffice,
  resolveLegacyIds,
  sectionForSortKey,
  splitOffices,
  type Section,
} from "./import-parse";

type Row = Record<string, string>;
const val = (r: Row, k: string) => (r[k] ?? "").trim();

/** Sort keys for the Älterengemeinschaft top-level groups (after the scouting ranges). */
const AEL_SORT_KEY: Record<Section, number> = {
  bund: 0,
  jungenbund: 0,
  maedchenbund: 0,
  orden_st_georg: 500,
  orden_st_christophorus: 510,
  bundesgilde: 520,
};

interface PersonModel {
  legacyId: string;
  data: {
    legacyId: string;
    salutation: string | null;
    title: string | null;
    firstName: string | null;
    lastName: string | null;
    scoutName: string | null;
    birthDate: string | null;
    deathDate: string | null;
    standName: string | null;
    street: string | null;
    addressExtra: string | null;
    postalCode: string | null;
    city: string | null;
    email: string | null;
    phones: { label: string; number: string }[];
    notes: string | null;
    doNotPrint: boolean;
  };
  // scouting
  scoutChain: string[]; // ordered group names, top first
  scoutSection: Section | null;
  amtTokens: string[];
  // Älterengemeinschaft / Orden
  aelSection: Section | null;
  aelTopName: string | null;
  ordensGroupName: string | null;
  ordensAmtTokens: string[];
  // mailing lists
  lists: string[]; // list names the person belongs to
}

interface Model {
  people: PersonModel[];
  tops: Map<string, { section: Section; sortKey: number; kind: string | null }>;
  officeNames: Set<string>;
  standNames: Set<string>;
  unmapped: {
    hilfsgruppeParseFailures: Set<string>;
    unmappedSections: Set<string>; // "NNN Name" whose number range has no section
    unmappedAel: Set<string>;
    unknownRankOffices: Set<string>;
    ordensGroupWithoutAel: number;
    amtWithoutGroup: number;
    collidingLegacyIds: string[];
  };
}

function buildModel(rows: Row[]): Model {
  // 1) resolve stable legacy ids (collapse conflict copies, keep distinct people)
  const dedupInput = rows.map((r, order) => ({
    id: val(r, "ID"),
    firstName: val(r, "Vorname"),
    lastName: val(r, "Nachname"),
    changedAt: val(r, "Änderungsdatum"),
    order,
  }));
  const resolved = resolveLegacyIds(dedupInput);

  const collidingLegacyIds = [
    ...new Set(resolved.filter((r) => r.legacyId.includes("#")).map((r) => r.legacyId.split("#")[0])),
  ].sort((a, b) => Number(a) - Number(b));

  const tops = new Map<string, { section: Section; sortKey: number; kind: string | null }>();
  const officeNames = new Set<string>();
  const standNames = new Set<string>();
  const unmapped: Model["unmapped"] = {
    hilfsgruppeParseFailures: new Set(),
    unmappedSections: new Set(),
    unmappedAel: new Set(),
    unknownRankOffices: new Set(),
    ordensGroupWithoutAel: 0,
    amtWithoutGroup: 0,
    collidingLegacyIds,
  };

  const people: PersonModel[] = [];

  for (const { order, legacyId } of resolved) {
    const r = rows[order];

    // --- scouting groups ---
    let scoutChain: string[] = [];
    let scoutSection: Section | null = null;
    const hilfsRaw = val(r, "Hilfsgruppe");
    if (hilfsRaw) {
      const parsed = parseHilfsgruppe(hilfsRaw);
      if (!parsed) {
        unmapped.hilfsgruppeParseFailures.add(hilfsRaw);
      } else {
        scoutSection = sectionForSortKey(parsed.sortKey);
        if (!scoutSection) {
          unmapped.unmappedSections.add(hilfsRaw);
        } else {
          scoutChain = buildGroupChain(parsed.name, val(r, "Übergeordnetegruppe"), val(r, "Gruppe"));
          const top = tops.get(parsed.name);
          if (!top) {
            tops.set(parsed.name, {
              section: scoutSection,
              sortKey: parsed.sortKey,
              kind: deriveKind(parsed.name),
            });
          }
        }
      }
    }

    const amtTokens = splitOffices(val(r, "Amt"));
    for (const t of amtTokens) {
      officeNames.add(t);
      if (isUnknownRank(rankForOffice(t))) unmapped.unknownRankOffices.add(t);
    }
    if (amtTokens.length > 0 && scoutChain.length === 0) unmapped.amtWithoutGroup++;

    // --- Älterengemeinschaft / Orden ---
    let aelSection: Section | null = null;
    let aelTopName: string | null = null;
    let ordensGroupName: string | null = null;
    const aelRaw = val(r, "Älterengemeinschaft");
    const ordensGroupRaw = val(r, "Ordensgruppe");
    if (aelRaw) {
      const norm = normalizeAelterengemeinschaft(aelRaw);
      if (!norm) {
        unmapped.unmappedAel.add(aelRaw);
      } else {
        aelSection = norm.section;
        aelTopName = norm.name;
        if (!tops.has(norm.name)) {
          tops.set(norm.name, {
            section: norm.section,
            sortKey: AEL_SORT_KEY[norm.section],
            kind: norm.kind,
          });
        }
        if (ordensGroupRaw) ordensGroupName = ordensGroupRaw;
      }
    } else if (ordensGroupRaw) {
      unmapped.ordensGroupWithoutAel++;
    }

    const ordensAmtTokens = splitOffices(val(r, "Ordensamt"));
    for (const t of ordensAmtTokens) {
      officeNames.add(t);
      if (isUnknownRank(rankForOffice(t))) unmapped.unknownRankOffices.add(t);
    }

    // --- rank / Stand ---
    const standName = val(r, "Stand") || null;
    if (standName) standNames.add(standName);

    // --- mailing lists ---
    const lists = DISTRIBUTION_LISTS.filter((l) => parseBool(r[l.column])).map((l) => l.name);

    const phones = buildPhones([
      { vorwahl: val(r, "Vorwahl1"), nummer: val(r, "Telefonnummer1"), bezeichner: val(r, "Telefonbezeichner1") },
      { vorwahl: val(r, "Vorwahl2"), nummer: val(r, "Telefonnummer2"), bezeichner: val(r, "Telefonbezeichner2") },
      { vorwahl: val(r, "Vorwahl3"), nummer: val(r, "Telefonnummer3"), bezeichner: val(r, "Telefonbezeichner3") },
    ]);

    people.push({
      legacyId,
      data: {
        legacyId,
        salutation: val(r, "Anrede") || null,
        title: val(r, "Titel") || null,
        firstName: val(r, "Vorname") || null,
        lastName: val(r, "Nachname") || null,
        scoutName: val(r, "Fahrtenname") || null,
        birthDate: parseDate(val(r, "Geburtsdatum")),
        deathDate: parseDate(val(r, "Todesdatum")),
        standName,
        street: val(r, "Straße") || null,
        addressExtra: val(r, "Zusatz") || null,
        postalCode: val(r, "Postleitzahl") || null,
        city: val(r, "Ort") || null,
        email: val(r, "Email") || null,
        phones,
        notes: val(r, "Anmerkung") || null,
        doNotPrint: parseBool(r["NichtAbdrucken"]),
      },
      scoutChain,
      scoutSection,
      amtTokens,
      aelSection,
      aelTopName,
      ordensGroupName,
      ordensAmtTokens,
      lists,
    });
  }

  return { people, tops, officeNames, standNames, unmapped };
}

/** Count how many distinct groups the model implies (tops + all chain children). */
function countGroups(model: Model): number {
  const names = new Set<string>(model.tops.keys());
  for (const p of model.people) {
    for (const n of p.scoutChain) names.add(n);
    if (p.ordensGroupName) names.add(p.ordensGroupName);
    if (p.aelTopName) names.add(p.aelTopName);
  }
  return names.size;
}

function printStats(model: Model, mode: string) {
  const assignmentCount = model.people.reduce((sum, p) => {
    let n = 0;
    if (p.scoutChain.length > 0) n += Math.max(1, p.amtTokens.length);
    if (p.aelSection) n += Math.max(1, p.ordensAmtTokens.length);
    return sum + n;
  }, 0);
  const membershipCount = model.people.reduce((s, p) => s + p.lists.length, 0);

  console.log(`\n===== Import statistics (${mode}) =====`);
  console.log(`  persons:                 ${model.people.length}`);
  console.log(`  groups (distinct):       ${countGroups(model)}`);
  console.log(`  offices (distinct):      ${model.officeNames.size}`);
  console.log(`  ranks / Stände:          ${model.standNames.size}`);
  console.log(`  assignments:             ${assignmentCount}`);
  console.log(`  distribution memberships:${membershipCount}`);
  console.log(`  mailing lists:           ${DISTRIBUTION_LISTS.length}`);

  const u = model.unmapped;
  console.log(`\n----- Needs manual review (values only, no personal data) -----`);
  console.log(`  colliding Access IDs (${u.collidingLegacyIds.length}): ${u.collidingLegacyIds.join(", ") || "-"}`);
  console.log(`  Hilfsgruppe parse failures: ${[...u.hilfsgruppeParseFailures].join(" | ") || "-"}`);
  console.log(`  Hilfsgruppen without section mapping: ${[...u.unmappedSections].join(" | ") || "-"}`);
  console.log(`  unmapped Älterengemeinschaft values: ${[...u.unmappedAel].join(" | ") || "-"}`);
  console.log(`  Ordensgruppe without Älterengemeinschaft (rows): ${u.ordensGroupWithoutAel}`);
  console.log(`  Amt without a group (rows): ${u.amtWithoutGroup}`);
  console.log(`  offices with unknown rank (999) [${u.unknownRankOffices.size}]:`);
  console.log(`    ${[...u.unknownRankOffices].sort().join(" | ") || "-"}`);
}

async function writeModel(model: Model, databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  try {
    await db.transaction(async (tx) => {
      // --- ranks (get-or-create by name; sort_order by first-seen order, deterministic) ---
      const rankCache = new Map<string, number>();
      for (const r of await tx.select().from(ranks)) rankCache.set(r.name, r.id);
      let rankOrder = rankCache.size;
      for (const name of model.standNames) {
        if (rankCache.has(name)) continue;
        rankOrder += 1;
        const [row] = await tx
          .insert(ranks)
          .values({ name, sortOrder: rankOrder * 10 })
          .returning({ id: ranks.id });
        rankCache.set(name, row.id);
      }

      // --- distribution lists (7 fixed) ---
      const listCache = new Map<string, number>();
      for (const l of await tx.select().from(distributionLists)) listCache.set(l.name, l.id);
      for (const { name } of DISTRIBUTION_LISTS) {
        if (listCache.has(name)) continue;
        const [row] = await tx
          .insert(distributionLists)
          .values({ name })
          .returning({ id: distributionLists.id });
        listCache.set(name, row.id);
      }

      // --- offices (get-or-create by name, with rank) ---
      const officeCache = new Map<string, number>();
      for (const o of await tx.select().from(offices)) officeCache.set(o.name, o.id);
      for (const name of model.officeNames) {
        if (officeCache.has(name)) continue;
        const [row] = await tx
          .insert(offices)
          .values({ name, rank: rankForOffice(name) })
          .returning({ id: offices.id });
        officeCache.set(name, row.id);
      }

      // --- groups: phase 1 tops (parent null), phase 2 children ---
      const groupCache = new Map<string, number>();
      for (const g of await tx.select().from(groups)) groupCache.set(g.name, g.id);

      for (const [name, meta] of model.tops) {
        if (groupCache.has(name)) continue;
        const [row] = await tx
          .insert(groups)
          .values({ name, section: meta.section, sortKey: meta.sortKey, kind: meta.kind, parentId: null })
          .returning({ id: groups.id });
        groupCache.set(name, row.id);
      }

      const ensureChild = async (name: string, parentId: number, section: Section) => {
        const existing = groupCache.get(name);
        if (existing !== undefined) return existing;
        const [row] = await tx
          .insert(groups)
          .values({ name, section, parentId, sortKey: 0, kind: deriveKind(name) })
          .returning({ id: groups.id });
        groupCache.set(name, row.id);
        return row.id;
      };

      for (const p of model.people) {
        if (p.scoutChain.length > 0 && p.scoutSection) {
          let parentId = groupCache.get(p.scoutChain[0]);
          for (let i = 1; i < p.scoutChain.length; i++) {
            parentId = await ensureChild(p.scoutChain[i], parentId!, p.scoutSection);
          }
        }
        if (p.aelSection && p.ordensGroupName) {
          await ensureChild(p.ordensGroupName, groupCache.get(p.aelTopName!)!, p.aelSection);
        }
      }

      // --- persons: upsert by legacy_id ---
      const personIdByLegacy = new Map<string, number>();
      for (const p of model.people) {
        const d = p.data;
        const rankId = d.standName ? rankCache.get(d.standName)! : null;
        const [row] = await tx
          .insert(persons)
          .values({
            legacyId: d.legacyId,
            salutation: d.salutation,
            title: d.title,
            firstName: d.firstName,
            lastName: d.lastName,
            scoutName: d.scoutName,
            birthDate: d.birthDate,
            deathDate: d.deathDate,
            rankId,
            street: d.street,
            addressExtra: d.addressExtra,
            postalCode: d.postalCode,
            city: d.city,
            email: d.email,
            phones: d.phones,
            notes: d.notes,
            doNotPrint: d.doNotPrint,
            updatedBy: "import-mdb",
          })
          .onConflictDoUpdate({
            target: persons.legacyId,
            set: {
              salutation: d.salutation,
              title: d.title,
              firstName: d.firstName,
              lastName: d.lastName,
              scoutName: d.scoutName,
              birthDate: d.birthDate,
              deathDate: d.deathDate,
              rankId,
              street: d.street,
              addressExtra: d.addressExtra,
              postalCode: d.postalCode,
              city: d.city,
              email: d.email,
              phones: d.phones,
              notes: d.notes,
              doNotPrint: d.doNotPrint,
              updatedBy: "import-mdb",
              updatedAt: new Date(),
            },
          })
          .returning({ id: persons.id });
        personIdByLegacy.set(d.legacyId, row.id);
      }

      // --- assignments + memberships: delete for imported persons, then recreate ---
      const importedIds = [...personIdByLegacy.values()];
      await tx.delete(assignments).where(inArray(assignments.personId, importedIds));
      await tx.delete(distributionListMembers).where(inArray(distributionListMembers.personId, importedIds));

      const assignmentRows: { personId: number; groupId: number; officeId: number | null }[] = [];
      const membershipRows: { listId: number; personId: number }[] = [];
      const seenAssignment = new Set<string>();
      const pushAssignment = (personId: number, groupId: number, officeId: number | null) => {
        const key = `${personId}:${groupId}:${officeId ?? "null"}`;
        if (seenAssignment.has(key)) return;
        seenAssignment.add(key);
        assignmentRows.push({ personId, groupId, officeId });
      };

      for (const p of model.people) {
        const personId = personIdByLegacy.get(p.legacyId)!;
        // scouting
        if (p.scoutChain.length > 0 && p.scoutSection) {
          const groupId = groupCache.get(p.scoutChain[p.scoutChain.length - 1])!;
          if (p.amtTokens.length > 0) {
            for (const t of p.amtTokens) pushAssignment(personId, groupId, officeCache.get(t)!);
          } else {
            pushAssignment(personId, groupId, null);
          }
        }
        // Orden / Älterengemeinschaft
        if (p.aelSection) {
          const groupName = p.ordensGroupName ?? p.aelTopName!;
          const groupId = groupCache.get(groupName)!;
          if (p.ordensAmtTokens.length > 0) {
            for (const t of p.ordensAmtTokens) pushAssignment(personId, groupId, officeCache.get(t)!);
          } else {
            pushAssignment(personId, groupId, null);
          }
        }
        // mailing lists
        for (const listName of p.lists) {
          membershipRows.push({ listId: listCache.get(listName)!, personId });
        }
      }

      if (assignmentRows.length > 0) await tx.insert(assignments).values(assignmentRows);
      if (membershipRows.length > 0) await tx.insert(distributionListMembers).values(membershipRows);
    });
  } finally {
    await pool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const mdbPath = args.find((a) => !a.startsWith("--"));
  if (!mdbPath) {
    console.error("Usage: npx tsx scripts/import-mdb.ts <path-to.mdb> [--dry-run]");
    process.exit(1);
  }

  const csv = execFileSync(
    "mdb-export",
    ["-D", "%Y-%m-%d", "-T", "%Y-%m-%d %H:%M:%S", mdbPath, "Adressen"],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );

  // Encoding sanity check: the export must carry German umlauts as valid UTF-8.
  const umlauts = (csv.match(/[äöüßÄÖÜ]/g) ?? []).length;
  console.log(`Encoding check: ${umlauts} umlaut characters found in export (expect > 0).`);
  if (umlauts === 0) {
    console.error("WARNING: no umlauts detected — the export encoding may be wrong.");
  }

  const rows: Row[] = parse(csv, { columns: true, skip_empty_lines: true, relax_column_count: true });
  console.log(`Parsed ${rows.length} rows from Adressen.`);

  const model = buildModel(rows);

  if (dryRun) {
    printStats(model, "dry-run — no writes");
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  await writeModel(model, databaseUrl);
  printStats(model, "written");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
