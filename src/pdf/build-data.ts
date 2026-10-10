/**
 * Build the fully sorted `data.json` tree that drives `src/pdf/templates/main.typ` (issue #5).
 *
 * All domain logic for the printed directory lives here so it can be unit-tested without a
 * database or Typst: the profile filter, the recursive group walk (by `sort_key` then name),
 * the office-rank ordering inside a group, the confidential cover entries, the memorial list
 * and the alphabetical name register. `buildProfileData` is a pure function over plain data;
 * `buildData` is the thin async wrapper that loads the rows from Postgres.
 *
 * Fidelity notes vs. the legacy LaTeX/Java generator:
 *  - Register sort key is Fahrtenname else Vorname (as the confidential text and IndexWorker.java
 *    specify), umlauts folded ae/oe/ue.
 *  - Section order in `komplett` follows `sort_key`; the old template hard-coded Mädchenbund
 *    before Jungenbund.
 *  - The Konvente/Kollegien summary tables of the Älterengemeinschaften are not reproduced.
 */
import { db } from "@/db";
import { assignments, groups, offices, persons, ranks } from "@/db/schema";
import { fold, formatDate, nullIfEmpty, todayIso } from "@/lib/format";
import { byName, collateDe, compareFields } from "@/lib/name-order";
import { RANK_UNRANKED } from "@/lib/rank";
import { SECTIONS, type Section } from "@/lib/sections";

// ---------------------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------------------

type Profile =
  | "komplett"
  | "nurBundesaemter"
  | "nurBundesgilde"
  | "nurOrdenStGeorg"
  | "nurOrdenStChristophorus";

const PROFILES: Profile[] = [
  "komplett",
  "nurBundesaemter",
  "nurBundesgilde",
  "nurOrdenStGeorg",
  "nurOrdenStChristophorus",
];

export function isProfile(value: string): value is Profile {
  return (PROFILES as string[]).includes(value);
}

export interface BuildOptions {
  withBirthdays: boolean;
  withRanks: boolean;
  withMemorial: boolean;
}

export interface DataPerson {
  id: number;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  scoutName: string | null;
  birthDate: string | null;
  deathDate: string | null;
  rankId: number | null;
  street: string | null;
  addressExtra: string | null;
  postalCode: string | null;
  city: string | null;
  email: string | null;
  phones: { label: string; number: string }[];
  doNotPrint: boolean;
}
export interface DataGroup {
  id: number;
  name: string;
  parentId: number | null;
  section: Section;
  sortKey: number;
}
export interface DataOffice {
  id: number;
  name: string;
  rank: number;
}
export interface DataRank {
  id: number;
  name: string;
}
interface DataAssignment {
  id: number;
  personId: number;
  groupId: number;
  officeId: number | null;
  /** Amtszeit end: NULL = active, set = ended — the one rule app-wide. Only active rows are printed. */
  endDate: string | null;
}
export interface RawData {
  persons: DataPerson[];
  groups: DataGroup[];
  offices: DataOffice[];
  ranks: DataRank[];
  assignments: DataAssignment[];
}

/** One rendered person block. String fields are `null` when empty (the template hides them). */
export interface Entry {
  label: string | null; // register anchor, set only on a person's first printed occurrence
  office: string | null; // italic office label printed above the name, null = no label
  name: string;
  detail: string | null; // scout name (+ rank when withRanks)
  extra: string | null; // address addition
  street: string | null;
  city: string | null; // "PLZ Ort"
  // All phone numbers with their labels (issue #8): the template prints "Label: number" so a
  // reader can tell mobil/privat/dienstlich apart; no extras are silently dropped. `label` is
  // null when the number carries no label.
  phones: { label: string | null; number: string }[];
  email: string | null;
  birth: string | null; // formatted birth date when withBirthdays
}

export interface GroupNode {
  name: string;
  level: number; // heading level 1..3
  entries: Entry[];
  children: GroupNode[];
}

interface RegisterEntry {
  label: string;
  lead: string; // bold lead token (Fahrtenname, / Vorname)
  rest: string; // remaining line incl. group/office breadcrumb
}

export interface ProfileData {
  profile: Profile;
  title: string;
  subtitle: string | null;
  date: string; // dd.MM.yyyy
  kanzlei: Entry[];
  options: BuildOptions;
  sections: GroupNode[];
  memorial: string[];
  register: RegisterEntry[];
}

// ---------------------------------------------------------------------------------------
//  Profile configuration
// ---------------------------------------------------------------------------------------

const PROFILE_SECTIONS: Record<Profile, readonly Section[]> = {
  komplett: SECTIONS,
  nurBundesaemter: ["bund", "jungenbund", "maedchenbund"],
  nurBundesgilde: ["bundesgilde"],
  nurOrdenStGeorg: ["orden_st_georg"],
  nurOrdenStChristophorus: ["orden_st_christophorus"],
};

const PROFILE_SUBTITLE: Record<Profile, string | null> = {
  komplett: null,
  nurBundesaemter: "(Ohne Älterengemeinschaften)",
  nurBundesgilde: "Bundesgilde",
  nurOrdenStGeorg: "Orden St. Georg über der Jungenschaft",
  nurOrdenStChristophorus: "Orden St. Christophorus",
};

// ---------------------------------------------------------------------------------------
//  Small pure helpers (exported for tests where useful)
// ---------------------------------------------------------------------------------------

// Sort keys use `fold` from src/lib/format.ts (DIN 5007-2 phone-book: ä→ae, ß→ss, accents
// stripped, lower-cased) — the same collation as the on-screen persons table.

function joinNonEmpty(parts: (string | null | undefined)[], sep = " "): string {
  return parts.map((p) => (p ?? "").trim()).filter((p) => p.length > 0).join(sep);
}

/** Leadership offices whose label is implied by the (sub)group heading and thus suppressed. */
function isLeaderOffice(name: string): boolean {
  const s = name.toLowerCase();
  return s.includes("führer") || s.includes("vogt") || s.includes("vögt");
}

function personDisplayName(p: DataPerson): string {
  return joinNonEmpty([p.title, p.firstName, p.lastName]);
}

/** All non-empty phone numbers with their (trimmed, else null) labels, order preserved. */
function entryPhones(p: DataPerson): { label: string | null; number: string }[] {
  return p.phones
    .map((ph) => ({ label: nullIfEmpty(ph.label), number: (ph.number ?? "").trim() }))
    .filter((ph) => ph.number.length > 0);
}

// ---------------------------------------------------------------------------------------
//  Core builder (pure)
// ---------------------------------------------------------------------------------------

export function buildProfileData(
  raw: RawData,
  profile: Profile,
  options: BuildOptions,
  today: Date = new Date(),
): ProfileData {
  const includedSections = new Set<Section>(PROFILE_SECTIONS[profile]);
  // The printed "Stand" is the calendar date in Europe/Berlin (the server runs in UTC).
  const dateDisplay = formatDate(todayIso(today));

  const personById = new Map(raw.persons.map((p) => [p.id, p]));
  const groupById = new Map(raw.groups.map((g) => [g.id, g]));
  const officeById = new Map(raw.offices.map((o) => [o.id, o]));
  const rankNameById = new Map(raw.ranks.map((r) => [r.id, r.name]));

  const childrenByParent = new Map<number | null, DataGroup[]>();
  for (const g of raw.groups) {
    const key = g.parentId ?? null;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(g);
  }

  // Amtszeiten: the printed directory only ever shows currently held offices. Active means
  // `endDate == null` — the same rule as the table, editor, Verteiler rules and mail (future
  // Bis dates are rejected on input, so an ended tenure is always in the past). Filter once,
  // here, and feed every downstream consumer (group tree, register, cover) from this array.
  const activeAssignments = raw.assignments.filter((a) => a.endDate == null);

  // assignments per group, filtered to printable + living persons
  const assignmentsByGroup = new Map<number, DataAssignment[]>();
  const assignmentsByPerson = new Map<number, DataAssignment[]>();
  for (const a of activeAssignments) {
    const p = personById.get(a.personId);
    if (!p || p.doNotPrint) continue;
    if (!assignmentsByPerson.has(a.personId)) assignmentsByPerson.set(a.personId, []);
    assignmentsByPerson.get(a.personId)!.push(a);
    if (p.deathDate) continue; // deceased persons never appear inside the group tree
    if (!assignmentsByGroup.has(a.groupId)) assignmentsByGroup.set(a.groupId, []);
    assignmentsByGroup.get(a.groupId)!.push(a);
  }

  const groupSort = (a: DataGroup, b: DataGroup) =>
    a.sortKey - b.sortKey || fold(a.name).localeCompare(fold(b.name), "de");

  const detailFor = (p: DataPerson): string | null => {
    const parts: string[] = [];
    if (nullIfEmpty(p.scoutName)) parts.push(p.scoutName!.trim());
    if (options.withRanks && p.rankId != null) {
      const rank = rankNameById.get(p.rankId);
      if (rank) parts.push(`(${rank})`);
    }
    return parts.length > 0 ? parts.join(" ") : null;
  };

  const anchored = new Set<number>(); // persons that already carry a register label

  // Build one entry for a person's presence in a group (offices already collapsed).
  const makeEntry = (p: DataPerson, officeNames: string[], depth: number): Entry => {
    // Below the top level a leader office is implied by the (sub)group heading and dropped —
    // but only that office, keeping any co-held non-leader offices (issue #7).
    let office: string | null = null;
    if (officeNames.length > 0) {
      const kept = officeNames.filter((n) => depth === 0 || !isLeaderOffice(n));
      office = kept.length > 0 ? kept.join(", ") : null;
    }
    let label: string | null = null;
    if (!anchored.has(p.id)) {
      label = `p${p.id}`;
      anchored.add(p.id);
    }
    return {
      label,
      office,
      name: personDisplayName(p),
      detail: detailFor(p),
      extra: nullIfEmpty(p.addressExtra),
      street: nullIfEmpty(p.street),
      city: nullIfEmpty(joinNonEmpty([p.postalCode, p.city])),
      phones: entryPhones(p),
      email: nullIfEmpty(p.email),
      birth: options.withBirthdays ? formatDate(p.birthDate) || null : null,
    };
  };

  // Collapse a group's assignments into sorted per-person entries.
  const entriesForGroup = (groupId: number, depth: number): Entry[] => {
    const list = assignmentsByGroup.get(groupId) ?? [];
    const byPerson = new Map<number, DataOffice[]>();
    for (const a of list) {
      if (!byPerson.has(a.personId)) byPerson.set(a.personId, []);
      if (a.officeId != null) {
        const o = officeById.get(a.officeId);
        if (o) byPerson.get(a.personId)!.push(o);
      }
    }
    const rows = [...byPerson.entries()].map(([personId, offs]) => {
      const p = personById.get(personId)!;
      const sortedOffs = [...offs].sort((x, y) => x.rank - y.rank || byName(x, y));
      const minRank = sortedOffs.length > 0 ? sortedOffs[0].rank : RANK_UNRANKED;
      const sortName = fold(joinNonEmpty([p.scoutName || p.lastName || p.firstName]));
      return { p, officeNames: sortedOffs.map((o) => o.name), minRank, sortName };
    });
    rows.sort(
      (a, b) =>
        a.minRank - b.minRank ||
        a.sortName.localeCompare(b.sortName, "de") ||
        fold(a.p.lastName ?? "").localeCompare(fold(b.p.lastName ?? ""), "de"),
    );
    return rows.map((r) => makeEntry(r.p, r.officeNames, depth));
  };

  // Recursive group node builder; returns null for groups with no printed content (pruned).
  // `visited` guards against parent_id cycles in the data, which would otherwise recurse forever.
  const visited = new Set<number>();
  const buildNode = (g: DataGroup, depth: number): GroupNode | null => {
    if (visited.has(g.id)) return null;
    visited.add(g.id);
    const entries = entriesForGroup(g.id, depth);
    const kids = (childrenByParent.get(g.id) ?? [])
      .filter((c) => includedSections.has(c.section))
      .sort(groupSort);
    const children: GroupNode[] = [];
    for (const c of kids) {
      const node = buildNode(c, depth + 1);
      if (node) children.push(node);
    }
    if (entries.length === 0 && children.length === 0) return null;
    return { name: g.name, level: Math.min(depth + 1, 3), entries, children };
  };

  // Top-level groups in the included sections drive render + anchor order.
  const topGroups = (childrenByParent.get(null) ?? [])
    .filter((g) => includedSections.has(g.section))
    .sort(groupSort);
  const sections: GroupNode[] = [];
  for (const g of topGroups) {
    const node = buildNode(g, 0);
    if (node) sections.push(node);
  }

  // ---- name register (only persons that were actually printed / anchored) ----
  const register = buildRegister(
    includedSections,
    personById,
    groupById,
    officeById,
    assignmentsByPerson,
    anchored,
  );

  // ---- memorial list (deceased persons with a membership in an included section) ----
  // The Gedenkseite exists for the deceased, but a dead member normally has their tenure
  // ended (holder-warning flow), so they carry no ACTIVE assignment. Source scope from ALL
  // assignments — active or ended — so the very people the page is for do not drop off
  // (issue #1). do_not_print is still honoured. Sorted with the shared ae-folded key so ä
  // collates as "ae" (issue #4b).
  const memorial: string[] = [];
  if (options.withMemorial) {
    const dead = raw.persons.filter((p) => !p.doNotPrint && p.deathDate);
    const inScope = dead.filter((p) =>
      raw.assignments.some((a) => {
        if (a.personId !== p.id) return false;
        const g = groupById.get(a.groupId);
        return g != null && includedSections.has(g.section);
      }),
    );
    // Nachname, then Vorname — compared as separate fields (see `compareFields`), exactly
    // like the register, so „Meyer" precedes „Meyer auf der Heide". Keys are folded once
    // per person, not inside the comparator.
    const decorated = inScope.map((p) => ({
      p,
      key: [fold(p.lastName ?? ""), fold(p.firstName ?? "")],
    }));
    decorated.sort((a, b) => compareFields(a.key, b.key));
    for (const { p } of decorated) {
      const base = personDisplayName(p);
      const scout = nullIfEmpty(p.scoutName);
      memorial.push(scout ? `${base} (${scout})` : base);
    }
  }

  // ---- confidential cover: the Bundeskanzler/in entries ----
  const kanzlei = buildKanzlei(activeAssignments, personById, officeById);

  return {
    profile,
    title: "Anschriftenverzeichnis",
    subtitle: PROFILE_SUBTITLE[profile],
    date: dateDisplay,
    kanzlei,
    options,
    sections,
    memorial,
    register,
  };
}

// ---------------------------------------------------------------------------------------
//  Register + cover helpers (pure)
// ---------------------------------------------------------------------------------------

function buildRegister(
  includedSections: Set<Section>,
  personById: Map<number, DataPerson>,
  groupById: Map<number, DataGroup>,
  officeById: Map<number, DataOffice>,
  assignmentsByPerson: Map<number, DataAssignment[]>,
  anchored: Set<number>,
): RegisterEntry[] {
  const rows: { key: string[]; entry: RegisterEntry }[] = [];

  for (const pid of anchored) {
    const p = personById.get(pid);
    if (!p) continue;

    const scout = nullIfEmpty(p.scoutName);
    const first = (p.firstName ?? "").trim();
    const last = (p.lastName ?? "").trim();
    const breadcrumb = registerBreadcrumb(
      assignmentsByPerson.get(pid) ?? [],
      includedSections,
      groupById,
      officeById,
    );

    // The register must show the very same name as the group tree, academic title included
    // (`personDisplayName` renders "Dr. Annegret Öhmann-Weiß"). The title is a name prefix, so
    // it goes in front of the first token that is actually printed — never into the sort key.
    // The two branches below print only PART of the name in the bold lead, which
    // `personDisplayName` cannot express, so they prefix the title themselves.
    const titled = (name: string) => joinNonEmpty([p.title, name]);

    let lead: string;
    let rest: string;
    if (scout) {
      lead = `${scout},`;
      rest = ` ${personDisplayName(p)}${breadcrumb}`;
    } else if (first) {
      lead = titled(first);
      rest = ` ${last}${breadcrumb}`;
    } else {
      // Neither Fahrtenname nor Vorname: lead with the surname so the entry does not sort to
      // the top with an empty bold lead (issue #9).
      lead = titled(last);
      rest = breadcrumb;
    }

    // Primary field (Fahrtenname else Vorname else Nachname) first, then the tiebreakers —
    // compared separately, see `compareFields`.
    const key = [scout || first || last, first, last].map((k) => fold(k));
    rows.push({ key, entry: { label: `p${pid}`, lead, rest } });
  }

  rows.sort((a, b) => compareFields(a.key, b.key));
  return rows.map((r) => r.entry);
}

/** ", parent, group, office, …" breadcrumb, mirroring IndexWorker.toIndexLine. */
function registerBreadcrumb(
  personAssignments: DataAssignment[],
  includedSections: Set<Section>,
  groupById: Map<number, DataGroup>,
  officeById: Map<number, DataOffice>,
): string {
  const officesByGroup = new Map<number, number[]>();
  for (const a of personAssignments) {
    const g = groupById.get(a.groupId);
    if (!g || !includedSections.has(g.section)) continue;
    if (!officesByGroup.has(a.groupId)) officesByGroup.set(a.groupId, []);
    if (a.officeId != null) officesByGroup.get(a.groupId)!.push(a.officeId);
  }

  // Walk memberships parent-before-child so the breadcrumb reads top-down; a sub-group
  // (low sort_key) must never precede its parent (issue #3). Depth wins over sort_key.
  const depthOf = (gid: number): number => {
    let d = 0;
    let cur: DataGroup | undefined = groupById.get(gid);
    const guard = new Set<number>();
    while (cur && cur.parentId != null && !guard.has(cur.id)) {
      guard.add(cur.id);
      cur = groupById.get(cur.parentId);
      d += 1;
    }
    return d;
  };
  const groupIds = [...officesByGroup.keys()].sort((x, y) => {
    const gx = groupById.get(x)!;
    const gy = groupById.get(y)!;
    return depthOf(x) - depthOf(y) || gx.sortKey - gy.sortKey || byName(gx, gy);
  });

  // Dedup group and office names across the WHOLE entry (issue #3), not just within a single
  // group: a parent shared by several memberships and a repeated office are printed once.
  const seenGroups = new Set<string>();
  const seenOffices = new Set<string>();
  let out = "";
  const pushGroup = (name: string) => {
    if (seenGroups.has(name)) return;
    seenGroups.add(name);
    out += `, ${name}`;
  };
  for (const gid of groupIds) {
    const g = groupById.get(gid)!;
    const parent = g.parentId != null ? groupById.get(g.parentId) : null;
    if (parent && parent.name !== g.name) pushGroup(parent.name);
    if (g.name !== "Bundesführung" && g.name !== "Bundesbeauftragte") pushGroup(g.name);
    const offs = officesByGroup
      .get(gid)!
      .map((id) => officeById.get(id))
      .filter((o): o is DataOffice => o != null)
      .sort((a, b) => a.rank - b.rank || byName(a, b));
    for (const o of offs) {
      if (seenOffices.has(o.name)) continue;
      seenOffices.add(o.name);
      out += `, ${o.name}`;
    }
  }
  return out;
}

function buildKanzlei(
  activeAssignments: DataAssignment[],
  personById: Map<number, DataPerson>,
  officeById: Map<number, DataOffice>,
): Entry[] {
  const kanzlerOfficeIds = new Set(
    [...officeById.values()]
      .filter((o) => {
        const s = o.name.toLowerCase();
        return s.includes("kanzler") && s.includes("des bundes");
      })
      .map((o) => o.id),
  );

  const seen = new Set<number>();
  const result: { office: string; entry: Entry }[] = [];
  for (const a of activeAssignments) {
    if (a.officeId == null || !kanzlerOfficeIds.has(a.officeId)) continue;
    const p = personById.get(a.personId);
    if (!p || p.doNotPrint || seen.has(p.id)) continue;
    seen.add(p.id);
    const officeName = officeById.get(a.officeId)!.name;
    result.push({
      office: officeName,
      entry: {
        label: null,
        office: officeName,
        name: personDisplayName(p),
        detail: null, // cover stays clean: no scout name / rank
        extra: nullIfEmpty(p.addressExtra),
        street: nullIfEmpty(p.street),
        city: nullIfEmpty(joinNonEmpty([p.postalCode, p.city])),
        phones: entryPhones(p),
        email: nullIfEmpty(p.email),
        birth: null,
      },
    });
  }
  // Deterministic cover order: sort the offices alphabetically, which puts "Kanzler des Bundes"
  // before "Kanzlerin des Bundes" (the shorter string wins as a prefix). Order is presentation
  // only — both entries are always printed — so the stable, data-independent rule is preferred
  // over hard-coding a precedence between the two offices.
  result.sort((a, b) => collateDe(a.office, b.office));
  return result.map((r) => r.entry);
}

// ---------------------------------------------------------------------------------------
//  Async wrapper: load rows from Postgres and build the profile tree
// ---------------------------------------------------------------------------------------

export async function buildData(profile: Profile, options: BuildOptions): Promise<ProfileData> {
  const [personRows, groupRows, officeRows, rankRows, assignmentRows] = await Promise.all([
    db.select().from(persons),
    db.select().from(groups),
    db.select().from(offices),
    db.select().from(ranks),
    db.select().from(assignments),
  ]);

  const raw: RawData = {
    persons: personRows.map((p) => ({
      id: p.id,
      title: p.title,
      firstName: p.firstName,
      lastName: p.lastName,
      scoutName: p.scoutName,
      birthDate: p.birthDate,
      deathDate: p.deathDate,
      rankId: p.rankId,
      street: p.street,
      addressExtra: p.addressExtra,
      postalCode: p.postalCode,
      city: p.city,
      email: p.email,
      phones: p.phones,
      doNotPrint: p.doNotPrint,
    })),
    groups: groupRows.map((g) => ({
      id: g.id,
      name: g.name,
      parentId: g.parentId,
      section: g.section,
      sortKey: g.sortKey,
    })),
    offices: officeRows.map((o) => ({ id: o.id, name: o.name, rank: o.rank })),
    ranks: rankRows.map((r) => ({ id: r.id, name: r.name })),
    assignments: assignmentRows.map((a) => ({
      id: a.id,
      personId: a.personId,
      groupId: a.groupId,
      officeId: a.officeId,
      endDate: a.endDate,
    })),
  };

  return buildProfileData(raw, profile, options);
}
