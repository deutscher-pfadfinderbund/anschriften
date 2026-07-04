/**
 * Build the fully sorted `data.json` tree that drives `src/pdf/templates/main.typ` (issue #5).
 *
 * All domain logic for the printed directory lives here so it can be unit-tested without a
 * database or Typst: the profile filter, the recursive group walk (by `sort_key` then name),
 * the office-rank ordering inside a group, the confidential cover entries, the memorial list
 * and the alphabetical name register. `buildProfileData` is a pure function over plain data;
 * `buildData` is the thin async wrapper that loads the rows from Postgres.
 *
 * Fidelity notes vs. the legacy LaTeX/Java generator (see PR text):
 *  - Register sort key is Fahrtenname else Vorname (as the confidential text and IndexWorker.java
 *    specify), umlauts folded ae/oe/ue.
 *  - Section order in `komplett` follows `sort_key`; the old template hard-coded Mädchenbund
 *    before Jungenbund.
 *  - The Konvente/Kollegien summary tables of the Älterengemeinschaften are not reproduced.
 */
import { db } from "@/db";
import { assignments, groups, offices, persons, ranks } from "@/db/schema";

// ---------------------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------------------

export type Section =
  | "bund"
  | "jungenbund"
  | "maedchenbund"
  | "orden_st_georg"
  | "orden_st_christophorus"
  | "bundesgilde";

export type Profile =
  | "komplett"
  | "nurBundesaemter"
  | "nurBundesgilde"
  | "nurOrdenStGeorg"
  | "nurOrdenStChristophorus";

export const PROFILES: Profile[] = [
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
export interface DataAssignment {
  id: number;
  personId: number;
  groupId: number;
  officeId: number | null;
  /** Amtszeit end (issue #22): NULL = active, set = ended. Only active rows are printed. */
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
  phoneStreet: string | null; // secondary phone, printed on the street row
  phoneCity: string | null; // primary phone, printed on the PLZ/Ort row
  email: string | null;
  birth: string | null; // formatted birth date when withBirthdays
}

export interface GroupNode {
  name: string;
  level: number; // heading level 1..3
  entries: Entry[];
  children: GroupNode[];
}

export interface RegisterEntry {
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

const PROFILE_SECTIONS: Record<Profile, Section[]> = {
  komplett: [
    "bund",
    "jungenbund",
    "maedchenbund",
    "orden_st_georg",
    "orden_st_christophorus",
    "bundesgilde",
  ],
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

const RANK_AMTLOS = 999;

// ---------------------------------------------------------------------------------------
//  Small pure helpers (exported for tests where useful)
// ---------------------------------------------------------------------------------------

/** Fold German umlauts the phone-book way and lower-case, for alphabetical register order. */
export function normalizeSortKey(value: string): string {
  return value
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .trim();
}

function joinNonEmpty(parts: (string | null | undefined)[], sep = " "): string {
  return parts.map((p) => (p ?? "").trim()).filter((p) => p.length > 0).join(sep);
}

function nullIfEmpty(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : null;
}

/** "1990-02-01" -> "01.02.1990"; anything unparseable -> null. */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function formatToday(today: Date): string {
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${today.getFullYear()}`;
}

/** Leadership offices whose label is implied by the (sub)group heading and thus suppressed. */
function isLeaderOffice(name: string): boolean {
  const s = name.toLowerCase();
  return s.includes("führer") || s.includes("vogt") || s.includes("vögt");
}

function personDisplayName(p: DataPerson): string {
  return joinNonEmpty([p.title, p.firstName, p.lastName]);
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

  // Amtszeiten (issue #22): the printed directory only ever shows currently held
  // offices. Filter to active tenures once, here, and feed every downstream consumer
  // (group tree, register, memorial, confidential cover) from this single array.
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
    a.sortKey - b.sortKey || normalizeSortKey(a.name).localeCompare(normalizeSortKey(b.name), "de");

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
    let office: string | null = null;
    if (officeNames.length > 0) {
      if (depth === 0 || !officeNames.some(isLeaderOffice)) {
        office = officeNames.join(", ");
      }
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
      phoneStreet: p.phones[1]?.number ?? null,
      phoneCity: p.phones[0]?.number ?? null,
      email: nullIfEmpty(p.email),
      birth: options.withBirthdays ? formatDate(p.birthDate) : null,
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
      const sortedOffs = [...offs].sort((x, y) => x.rank - y.rank || x.name.localeCompare(y.name, "de"));
      const minRank = sortedOffs.length > 0 ? sortedOffs[0].rank : RANK_AMTLOS;
      const sortName = normalizeSortKey(joinNonEmpty([p.scoutName || p.lastName || p.firstName]));
      return { p, officeNames: sortedOffs.map((o) => o.name), minRank, sortName };
    });
    rows.sort(
      (a, b) =>
        a.minRank - b.minRank ||
        a.sortName.localeCompare(b.sortName, "de") ||
        normalizeSortKey(a.p.lastName ?? "").localeCompare(normalizeSortKey(b.p.lastName ?? ""), "de"),
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
    raw,
    includedSections,
    personById,
    groupById,
    officeById,
    assignmentsByPerson,
    anchored,
  );

  // ---- memorial list (deceased persons with a membership in an included section) ----
  const memorial: string[] = [];
  if (options.withMemorial) {
    const dead = raw.persons.filter((p) => !p.doNotPrint && p.deathDate);
    const inScope = dead.filter((p) =>
      (assignmentsByPerson.get(p.id) ?? []).some((a) => {
        const g = groupById.get(a.groupId);
        return g && includedSections.has(g.section);
      }),
    );
    inScope.sort((a, b) =>
      joinNonEmpty([a.lastName, a.firstName]).localeCompare(joinNonEmpty([b.lastName, b.firstName]), "de"),
    );
    for (const p of inScope) {
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
    date: formatToday(today),
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
  raw: RawData,
  includedSections: Set<Section>,
  personById: Map<number, DataPerson>,
  groupById: Map<number, DataGroup>,
  officeById: Map<number, DataOffice>,
  assignmentsByPerson: Map<number, DataAssignment[]>,
  anchored: Set<number>,
): RegisterEntry[] {
  const rows: { key: string; entry: RegisterEntry }[] = [];

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

    let lead: string;
    let rest: string;
    if (scout) {
      lead = `${scout},`;
      rest = ` ${joinNonEmpty([first, last])}${breadcrumb}`;
    } else {
      lead = first;
      rest = ` ${last}${breadcrumb}`;
    }

    const key = normalizeSortKey(`${scout || first}#${first}#${last}`);
    rows.push({ key, entry: { label: `p${pid}`, lead, rest } });
  }

  rows.sort((a, b) => a.key.localeCompare(b.key, "de"));
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

  const groupIds = [...officesByGroup.keys()].sort((x, y) => {
    const gx = groupById.get(x)!;
    const gy = groupById.get(y)!;
    return gx.sortKey - gy.sortKey || gx.name.localeCompare(gy.name, "de");
  });

  let out = "";
  for (const gid of groupIds) {
    const g = groupById.get(gid)!;
    const parent = g.parentId != null ? groupById.get(g.parentId) : null;
    if (parent && parent.name !== g.name) out += `, ${parent.name}`;
    if (g.name !== "Bundesführung" && g.name !== "Bundesbeauftragte") out += `, ${g.name}`;
    const offs = officesByGroup
      .get(gid)!
      .map((id) => officeById.get(id))
      .filter((o): o is DataOffice => o != null)
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "de"));
    const seen = new Set<string>();
    for (const o of offs) {
      if (seen.has(o.name)) continue;
      seen.add(o.name);
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
        phoneStreet: p.phones[1]?.number ?? null,
        phoneCity: p.phones[0]?.number ?? null,
        email: nullIfEmpty(p.email),
        birth: null,
      },
    });
  }
  // "Kanzlerin des Bundes" before "Kanzler des Bundes"
  result.sort((a, b) => a.office.localeCompare(b.office, "de"));
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
      section: g.section as Section,
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
