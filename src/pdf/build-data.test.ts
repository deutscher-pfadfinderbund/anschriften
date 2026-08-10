import { describe, expect, it } from "vitest";
import {
  buildProfileData,
  formatDate,
  normalizeSortKey,
  type BuildOptions,
  type DataGroup,
  type DataOffice,
  type DataPerson,
  type DataRank,
  type Entry,
  type GroupNode,
  type RawData,
} from "./build-data";

// All test data below is fictitious.

const ALL_OPTIONS: BuildOptions = { withBirthdays: true, withRanks: true, withMemorial: true };
const NO_OPTIONS: BuildOptions = { withBirthdays: false, withRanks: false, withMemorial: false };

const RANKS: DataRank[] = [
  { id: 1, name: "Späher" },
  { id: 2, name: "Knappe" },
];

const OFFICES: DataOffice[] = [
  { id: 1, name: "Bundesvogt", rank: 10 },
  { id: 2, name: "Kanzlerin des Bundes", rank: 20 },
  { id: 3, name: "Kämmerer des Bundes", rank: 30 },
  { id: 4, name: "Gauvogt", rank: 10 },
  { id: 5, name: "Knappenmeister", rank: 999 },
  { id: 6, name: "Jungenschaftsführer", rank: 10 },
  { id: 7, name: "Beisitzer", rank: 50 },
];

const GROUPS: DataGroup[] = [
  { id: 1, name: "Bundesführung", parentId: null, section: "bund", sortKey: 10 },
  { id: 2, name: "Gau Franken", parentId: null, section: "jungenbund", sortKey: 110 },
  { id: 3, name: "Jungenschaft Hohenlohe", parentId: 2, section: "jungenbund", sortKey: 0 },
  { id: 4, name: "Bundesgilde", parentId: null, section: "bundesgilde", sortKey: 520 },
  { id: 5, name: "Kollegium Nord", parentId: 4, section: "bundesgilde", sortKey: 0 },
];

function person(over: Partial<DataPerson> & { id: number }): DataPerson {
  return {
    title: null,
    firstName: null,
    lastName: null,
    scoutName: null,
    birthDate: null,
    deathDate: null,
    rankId: null,
    street: null,
    addressExtra: null,
    postalCode: null,
    city: null,
    email: null,
    phones: [],
    doNotPrint: false,
    ...over,
  };
}

/** Flatten every entry of the built tree (pre-order) for easy assertions. */
function allEntries(nodes: GroupNode[]): Entry[] {
  const out: Entry[] = [];
  const walk = (n: GroupNode) => {
    out.push(...n.entries);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

function findNode(nodes: GroupNode[], name: string): GroupNode | undefined {
  for (const n of nodes) {
    if (n.name === name) return n;
    const hit = findNode(n.children, name);
    if (hit) return hit;
  }
  return undefined;
}

describe("normalizeSortKey", () => {
  it("folds umlauts ae/oe/ue and lower-cases", () => {
    expect(normalizeSortKey("Öhmann")).toBe("oehmann");
    expect(normalizeSortKey("Bär")).toBe("baer");
    expect(normalizeSortKey("Groß")).toBe("gross");
  });
});

describe("formatDate", () => {
  it("reformats ISO to dd.MM.yyyy and rejects garbage", () => {
    expect(formatDate("1990-02-01")).toBe("01.02.1990");
    expect(formatDate(null)).toBeNull();
    expect(formatDate("not-a-date")).toBeNull();
  });
});

describe("profile filtering", () => {
  const raw: RawData = {
    ranks: RANKS,
    offices: OFFICES,
    groups: GROUPS,
    persons: [
      person({ id: 1, firstName: "Holger", lastName: "Specht" }),
      person({ id: 2, firstName: "Gerd", lastName: "Gilde" }),
    ],
    assignments: [
      { id: 1, personId: 1, groupId: 1, officeId: 1, endDate: null }, // Bundesführung (bund)
      { id: 2, personId: 2, groupId: 5, officeId: null, endDate: null }, // Kollegium Nord (bundesgilde)
    ],
  };

  it("komplett contains both bund and bundesgilde sections", () => {
    const data = buildProfileData(raw, "komplett", ALL_OPTIONS);
    expect(findNode(data.sections, "Bundesführung")).toBeDefined();
    expect(findNode(data.sections, "Bundesgilde")).toBeDefined();
  });

  it("nurBundesgilde drops the bund section entirely", () => {
    const data = buildProfileData(raw, "nurBundesgilde", ALL_OPTIONS);
    expect(findNode(data.sections, "Bundesführung")).toBeUndefined();
    expect(findNode(data.sections, "Bundesgilde")).toBeDefined();
    expect(data.subtitle).toBe("Bundesgilde");
  });

  it("nurBundesaemter keeps bund/jungenbund but not the Gilde", () => {
    const data = buildProfileData(raw, "nurBundesaemter", ALL_OPTIONS);
    expect(findNode(data.sections, "Bundesführung")).toBeDefined();
    expect(findNode(data.sections, "Bundesgilde")).toBeUndefined();
  });
});

describe("office history — only active tenures are printed (issue #22)", () => {
  it("omits an ended tenure from the group tree and the register", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [person({ id: 1, firstName: "Holger", lastName: "Specht", scoutName: "Falke" })],
      assignments: [
        // Active current office in Bundesführung.
        { id: 1, personId: 1, groupId: 1, officeId: 1, endDate: null },
        // Ended tenure in a jungenbund subgroup — must NOT be printed anywhere.
        { id: 2, personId: 1, groupId: 3, officeId: 6, endDate: "2019-02-28" },
      ],
    };
    const data = buildProfileData(raw, "komplett", ALL_OPTIONS);
    // The active office renders; the ended-tenure group is pruned (no active member).
    expect(findNode(data.sections, "Bundesführung")).toBeDefined();
    expect(findNode(data.sections, "Jungenschaft Hohenlohe")).toBeUndefined();
    // The register breadcrumb reflects only the active office, not the historic one.
    expect(data.register).toHaveLength(1);
    expect(data.register[0].rest).not.toContain("Jungenschaft Hohenlohe");
  });

  it("drops a person entirely when their only tenure has ended", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [person({ id: 1, firstName: "Ehe", lastName: "Malig" })],
      assignments: [{ id: 1, personId: 1, groupId: 1, officeId: 1, endDate: "2014-12-31" }],
    };
    const data = buildProfileData(raw, "komplett", ALL_OPTIONS);
    expect(data.sections).toHaveLength(0);
    expect(data.register).toHaveLength(0);
  });

  it("excludes an ended Kanzler tenure from the confidential cover", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [
        person({ id: 1, firstName: "Alt", lastName: "Kanzler" }),
        person({ id: 2, firstName: "Neu", lastName: "Kanzler" }),
      ],
      assignments: [
        // office 2 = "Kanzlerin des Bundes"
        { id: 1, personId: 1, groupId: 1, officeId: 2, endDate: "2022-12-31" },
        { id: 2, personId: 2, groupId: 1, officeId: 2, endDate: null },
      ],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    const kanzleiNames = data.kanzlei.map((e) => e.name);
    expect(kanzleiNames).toEqual(["Neu Kanzler"]);
  });
});

describe("group tree ordering", () => {
  it("sorts top-level groups by sort_key then name and nests children", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [
        person({ id: 1, firstName: "A", lastName: "A" }),
        person({ id: 2, firstName: "B", lastName: "B" }),
      ],
      assignments: [
        { id: 1, personId: 1, groupId: 3, officeId: 6, endDate: null }, // Jungenschaft Hohenlohe (child of Gau Franken)
        { id: 2, personId: 2, groupId: 1, officeId: 1, endDate: null }, // Bundesführung
      ],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    expect(data.sections.map((s) => s.name)).toEqual(["Bundesführung", "Gau Franken"]);
    const franken = findNode(data.sections, "Gau Franken")!;
    expect(franken.level).toBe(1);
    expect(franken.children.map((c) => c.name)).toEqual(["Jungenschaft Hohenlohe"]);
    expect(franken.children[0].level).toBe(2);
  });

  it("prunes groups without any printable member", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [person({ id: 1, firstName: "A", lastName: "A" })],
      assignments: [{ id: 1, personId: 1, groupId: 1, officeId: 1, endDate: null }],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    expect(findNode(data.sections, "Gau Franken")).toBeUndefined();
    expect(findNode(data.sections, "Bundesgilde")).toBeUndefined();
  });
});

describe("office rank ordering inside a group", () => {
  it("orders Bundesvogt < Kanzlerin < Kämmerer and puts amtslose last", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [
        person({ id: 1, firstName: "Kaem", lastName: "Merer" }),
        person({ id: 2, firstName: "Voll", lastName: "Vogt" }),
        person({ id: 3, firstName: "Kanz", lastName: "Ler" }),
        person({ id: 4, firstName: "Ohne", lastName: "Amt" }),
      ],
      assignments: [
        { id: 1, personId: 1, groupId: 1, officeId: 3, endDate: null }, // Kämmerer (30)
        { id: 2, personId: 2, groupId: 1, officeId: 1, endDate: null }, // Bundesvogt (10)
        { id: 3, personId: 3, groupId: 1, officeId: 2, endDate: null }, // Kanzlerin (20)
        { id: 4, personId: 4, groupId: 1, officeId: null, endDate: null }, // amtslos (999)
      ],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    const names = findNode(data.sections, "Bundesführung")!.entries.map((e) => e.name);
    expect(names).toEqual(["Voll Vogt", "Kanz Ler", "Kaem Merer", "Ohne Amt"]);
  });

  it("collapses multiple offices of one person into a single entry with a min-rank sort", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [person({ id: 1, firstName: "Multi", lastName: "Amt" })],
      assignments: [
        { id: 1, personId: 1, groupId: 1, officeId: 3, endDate: null }, // Kämmerer
        { id: 2, personId: 1, groupId: 1, officeId: 2, endDate: null }, // Kanzlerin
      ],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    const entries = findNode(data.sections, "Bundesführung")!.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].office).toBe("Kanzlerin des Bundes, Kämmerer des Bundes");
  });
});

describe("office label suppression", () => {
  it("shows the office at depth 0 but hides leader offices in subgroups", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [
        person({ id: 1, firstName: "Fuehrer", lastName: "Sub" }),
        person({ id: 2, firstName: "Knappe", lastName: "Sub" }),
        person({ id: 3, firstName: "Vogt", lastName: "Top" }),
      ],
      assignments: [
        { id: 1, personId: 1, groupId: 3, officeId: 6, endDate: null }, // Jungenschaftsführer in subgroup
        { id: 2, personId: 2, groupId: 3, officeId: 5, endDate: null }, // Knappenmeister in subgroup
        { id: 3, personId: 3, groupId: 2, officeId: 4, endDate: null }, // Gauvogt at top level of Gau Franken
      ],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    const sub = findNode(data.sections, "Jungenschaft Hohenlohe")!;
    const fuehrer = sub.entries.find((e) => e.name === "Fuehrer Sub")!;
    const knappe = sub.entries.find((e) => e.name === "Knappe Sub")!;
    expect(fuehrer.office).toBeNull(); // leader office suppressed in subgroup
    expect(knappe.office).toBe("Knappenmeister"); // non-leader office shown

    const top = findNode(data.sections, "Gau Franken")!;
    expect(top.entries[0].office).toBe("Gauvogt"); // depth 0 always labels
  });
});

describe("do_not_print and deceased handling", () => {
  const raw: RawData = {
    ranks: RANKS,
    offices: OFFICES,
    groups: GROUPS,
    persons: [
      person({ id: 1, firstName: "Hidden", lastName: "Person", doNotPrint: true }),
      person({ id: 2, firstName: "Living", lastName: "Member" }),
      person({ id: 3, firstName: "Gone", lastName: "Away", scoutName: "geist", deathDate: "2020-05-01" }),
    ],
    assignments: [
      { id: 1, personId: 1, groupId: 1, officeId: 1, endDate: null },
      { id: 2, personId: 2, groupId: 1, officeId: 2, endDate: null },
      { id: 3, personId: 3, groupId: 1, officeId: 3, endDate: null },
    ],
  };

  it("omits do_not_print persons from tree, register and memorial", () => {
    const data = buildProfileData(raw, "komplett", ALL_OPTIONS);
    expect(allEntries(data.sections).some((e) => e.name === "Hidden Person")).toBe(false);
    expect(data.register.some((r) => r.rest.includes("Hidden"))).toBe(false);
    expect(data.memorial.some((m) => m.includes("Hidden"))).toBe(false);
  });

  it("moves deceased out of the tree/register and into the memorial list", () => {
    const data = buildProfileData(raw, "komplett", ALL_OPTIONS);
    expect(allEntries(data.sections).some((e) => e.name === "Gone Away")).toBe(false);
    expect(data.register.some((r) => r.rest.includes("Gone"))).toBe(false);
    expect(data.memorial).toContain("Gone Away (geist)");
  });

  it("omits the memorial list when the option is off", () => {
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    expect(data.memorial).toEqual([]);
  });
});

describe("name register", () => {
  it("sorts by Fahrtenname else Vorname with umlaut folding and formats lead/rest", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [
        person({ id: 1, firstName: "Anton", lastName: "Zebra" }), // no scout -> "Anton"
        person({ id: 2, firstName: "Berta", lastName: "Adler", scoutName: "Örni" }), // scout "Örni" -> oe...
        person({ id: 3, firstName: "Cäsar", lastName: "Bar" }), // no scout -> "Cäsar" -> cae...
      ],
      assignments: [
        { id: 1, personId: 1, groupId: 1, officeId: 1, endDate: null },
        { id: 2, personId: 2, groupId: 1, officeId: 2, endDate: null },
        { id: 3, personId: 3, groupId: 1, officeId: 3, endDate: null },
      ],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    // sort keys: anton, caesar (Cäsar), oerni (Örni) -> Anton, Cäsar, Örni
    expect(data.register.map((r) => r.lead)).toEqual(["Anton", "Cäsar", "Örni,"]);
    const oerni = data.register.find((r) => r.lead === "Örni,")!;
    expect(oerni.rest.startsWith(" Berta Adler")).toBe(true);
    const anton = data.register.find((r) => r.lead === "Anton")!;
    expect(anton.rest.startsWith(" Zebra")).toBe(true); // no scout: rest begins with last name
  });

  it("sorts a numbered Fahrtenname after its unnumbered namesake", () => {
    // The sort key must compare Fahrtenname, Vorname and Nachname as separate fields. Joined
    // into one string with a separator, the separator joins the comparison: under the German
    // collation " " < "#", so "habicht ii#marcel" sorted BEFORE "habicht#hans-juergen" and the
    // register printed „Habicht II" ahead of „Habicht".
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [
        person({ id: 1, firstName: "Marcel", lastName: "Übelacker", scoutName: "Habicht II" }),
        person({ id: 2, firstName: "Hans-Jürgen", lastName: "Brandmüller", scoutName: "Habicht" }),
        person({ id: 3, firstName: "Volker", lastName: "Ahrensbök", scoutName: "Möwe II" }),
        person({ id: 4, firstName: "Beate", lastName: "Schönherr", scoutName: "Möwe" }),
      ],
      assignments: [
        { id: 1, personId: 1, groupId: 1, officeId: 1, endDate: null },
        { id: 2, personId: 2, groupId: 1, officeId: 2, endDate: null },
        { id: 3, personId: 3, groupId: 1, officeId: 3, endDate: null },
        { id: 4, personId: 4, groupId: 1, officeId: 7, endDate: null },
      ],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    expect(data.register.map((r) => r.lead)).toEqual([
      "Habicht,",
      "Habicht II,",
      "Möwe,",
      "Möwe II,",
    ]);
  });

  it("keeps the academic title in the register, exactly as the group tree prints it", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [
        person({
          id: 1,
          title: "Dr.",
          firstName: "Annegret",
          lastName: "Öhmann-Weiß",
          scoutName: "Silberdistel",
        }),
        person({ id: 2, title: "Prof.", firstName: "Bernd", lastName: "Kranz" }), // no scout name
        person({ id: 3, title: "Dr.", lastName: "Zufall" }), // neither scout name nor Vorname
      ],
      assignments: [
        { id: 1, personId: 1, groupId: 1, officeId: 2, endDate: null },
        { id: 2, personId: 2, groupId: 1, officeId: 1, endDate: null },
        { id: 3, personId: 3, groupId: 1, officeId: 3, endDate: null },
      ],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    expect(allEntries(data.sections).map((e) => e.name)).toContain("Dr. Annegret Öhmann-Weiß");

    const silberdistel = data.register.find((r) => r.lead === "Silberdistel,")!;
    expect(silberdistel.rest.startsWith(" Dr. Annegret Öhmann-Weiß")).toBe(true);
    // Without a Fahrtenname the title joins the bold lead so the printed name stays complete…
    expect(data.register.map((r) => r.lead)).toContain("Prof. Bernd");
    expect(data.register.map((r) => r.lead)).toContain("Dr. Zufall");
    // …but the title never takes part in the sorting: Bernd (b) still precedes Silberdistel (s).
    expect(data.register.map((r) => r.lead)).toEqual([
      "Prof. Bernd",
      "Silberdistel,",
      "Dr. Zufall",
    ]);
  });

  it("builds a parent/group/office breadcrumb and skips the Bundesführung group name", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [
        person({ id: 1, firstName: "Tobias", lastName: "Hornung", scoutName: "turbo" }),
        person({ id: 2, firstName: "Holger", lastName: "Specht" }),
      ],
      assignments: [
        { id: 1, personId: 1, groupId: 3, officeId: 5, endDate: null }, // Knappenmeister, Jungenschaft Hohenlohe < Gau Franken
        { id: 2, personId: 2, groupId: 1, officeId: 1, endDate: null }, // Bundesvogt in Bundesführung
      ],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    const turbo = data.register.find((r) => r.lead === "turbo,")!;
    expect(turbo.rest).toBe(" Tobias Hornung, Gau Franken, Jungenschaft Hohenlohe, Knappenmeister");
    const holger = data.register.find((r) => r.lead === "Holger")!;
    // "Bundesführung" group name is suppressed in the breadcrumb, only the office remains
    expect(holger.rest).toBe(" Specht, Bundesvogt");
  });
});

describe("register anchor labels", () => {
  it("labels a person only on the first printed occurrence and keeps the register label stable", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [person({ id: 7, firstName: "Doppel", lastName: "Amt", scoutName: "duo" })],
      assignments: [
        { id: 1, personId: 7, groupId: 1, officeId: 1, endDate: null }, // Bundesführung (rendered first)
        { id: 2, personId: 7, groupId: 2, officeId: 4, endDate: null }, // Gau Franken (rendered later)
      ],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    const labels = allEntries(data.sections).map((e) => e.label);
    expect(labels).toEqual(["p7", null]); // only the first entry carries the label
    expect(data.register).toHaveLength(1);
    expect(data.register[0].label).toBe("p7");
  });
});

describe("options: ranks, birthdays, cover", () => {
  const raw: RawData = {
    ranks: RANKS,
    offices: OFFICES,
    groups: GROUPS,
    persons: [
      person({
        id: 1,
        firstName: "Rita",
        lastName: "Rang",
        scoutName: "rambo",
        rankId: 1,
        birthDate: "1985-03-12",
        phones: [
          { label: "Festnetz", number: "030 111" },
          { label: "Mobil", number: "0173 222" },
        ],
      }),
      person({ id: 2, firstName: "Heide", lastName: "Ortner" }),
    ],
    assignments: [
      { id: 1, personId: 1, groupId: 1, officeId: 1, endDate: null },
      { id: 2, personId: 2, groupId: 1, officeId: 2, endDate: null }, // Kanzlerin des Bundes -> cover
    ],
  };

  it("appends the rank to the detail and adds birthdate when the options are on", () => {
    const data = buildProfileData(raw, "komplett", ALL_OPTIONS, new Date(2026, 6, 4));
    const rita = findNode(data.sections, "Bundesführung")!.entries.find((e) => e.name === "Rita Rang")!;
    expect(rita.detail).toBe("rambo (Späher)");
    expect(rita.birth).toBe("12.03.1985");
    // All phones flow through with their labels, in input order (issue #8).
    expect(rita.phones).toEqual([
      { label: "Festnetz", number: "030 111" },
      { label: "Mobil", number: "0173 222" },
    ]);
    expect(data.date).toBe("04.07.2026");
  });

  it("drops rank and birthdate when the options are off", () => {
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    const rita = findNode(data.sections, "Bundesführung")!.entries.find((e) => e.name === "Rita Rang")!;
    expect(rita.detail).toBe("rambo");
    expect(rita.birth).toBeNull();
  });

  it("puts the Bundeskanzlerin on the confidential cover", () => {
    const data = buildProfileData(raw, "komplett", ALL_OPTIONS);
    expect(data.kanzlei).toHaveLength(1);
    expect(data.kanzlei[0].office).toBe("Kanzlerin des Bundes");
    expect(data.kanzlei[0].name).toBe("Heide Ortner");
    expect(data.kanzlei[0].detail).toBeNull(); // cover stays clean
  });
});

describe("issue #4 — normalizeSortKey collation", () => {
  it("collates ae-folded (DIN 5007-2) and NFC-normalizes decomposed umlauts", () => {
    const names = ["Zeder", "Öhmann", "Aal", "Müller", "Muhs", "Munz"];
    const sorted = [...names].sort((a, b) =>
      normalizeSortKey(a).localeCompare(normalizeSortKey(b), "de"),
    );
    // Müller -> "mueller" sorts before Muhs/Munz because 'e' < 'h' < 'n'.
    expect(sorted).toEqual(["Aal", "Müller", "Muhs", "Munz", "Öhmann", "Zeder"]);
    // "Öhmann" as O + combining diaeresis (U+0308) folds like the precomposed form.
    expect(normalizeSortKey("Öhmann")).toBe("oehmann");
    expect(normalizeSortKey("Öhmann")).toBe(normalizeSortKey("Öhmann"));
  });
});

describe("issue #6 — a future Amtszeit-bis keeps an officer in print", () => {
  it("treats an assignment ending today or later as still active", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [
        person({ id: 1, firstName: "Future", lastName: "Voll" }),
        person({ id: 2, firstName: "Past", lastName: "Gone" }),
      ],
      assignments: [
        { id: 1, personId: 1, groupId: 1, officeId: 1, endDate: "2030-01-01" }, // future -> active
        { id: 2, personId: 2, groupId: 1, officeId: 2, endDate: "2020-01-01" }, // past -> ended
      ],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS, new Date(2026, 6, 4));
    const names = findNode(data.sections, "Bundesführung")!.entries.map((e) => e.name);
    expect(names).toEqual(["Future Voll"]);
    expect(data.register.map((r) => r.rest.trim())).toEqual(["Voll, Bundesvogt"]);
  });

  it("keeps an assignment active exactly on its end date (boundary)", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [person({ id: 1, firstName: "Edge", lastName: "Case" })],
      assignments: [{ id: 1, personId: 1, groupId: 1, officeId: 1, endDate: "2026-07-04" }],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS, new Date(2026, 6, 4));
    expect(findNode(data.sections, "Bundesführung")).toBeDefined();
  });
});

describe("issue #7 — a leader office does not hide co-held non-leader offices", () => {
  it("keeps Beisitzer when the person is also Jungenschaftsführer in a subgroup", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [person({ id: 1, firstName: "Both", lastName: "Offices" })],
      assignments: [
        { id: 1, personId: 1, groupId: 3, officeId: 6, endDate: null }, // Jungenschaftsführer (leader)
        { id: 2, personId: 1, groupId: 3, officeId: 7, endDate: null }, // Beisitzer (non-leader)
      ],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    const entry = findNode(data.sections, "Jungenschaft Hohenlohe")!.entries.find(
      (e) => e.name === "Both Offices",
    )!;
    expect(entry.office).toBe("Beisitzer"); // leader filtered, the rest of the list kept (not null)
  });
});

describe("issue #8 — all phones pass through with their labels", () => {
  it("carries every number with its label, nulls a blank label and drops empty numbers", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [
        person({
          id: 1,
          firstName: "Many",
          lastName: "Phones",
          phones: [
            { label: "Mobil", number: "0173 1" },
            { label: "Privat", number: "030 2" },
            { label: "Dienstlich", number: "089 3" },
            { label: "", number: "099 4" }, // blank label -> null
            { label: "Leer", number: "  " }, // empty number -> dropped
          ],
        }),
      ],
      assignments: [{ id: 1, personId: 1, groupId: 1, officeId: 1, endDate: null }],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    const entry = findNode(data.sections, "Bundesführung")!.entries[0];
    expect(entry.phones).toEqual([
      { label: "Mobil", number: "0173 1" },
      { label: "Privat", number: "030 2" },
      { label: "Dienstlich", number: "089 3" },
      { label: null, number: "099 4" },
    ]);
  });
});

describe("issue #9 — a surname-only person sorts by surname with a non-empty lead", () => {
  it("leads with the surname and sorts on it, not to the top with an empty lead", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [
        person({ id: 1, lastName: "Müller" }), // surname only, no Fahrten-/Vorname
        person({ id: 2, firstName: "Anton", lastName: "Zebra" }),
      ],
      assignments: [
        { id: 1, personId: 1, groupId: 1, officeId: 1, endDate: null },
        { id: 2, personId: 2, groupId: 1, officeId: 2, endDate: null },
      ],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    // "mueller" sorts after "anton" — not to the very top with an empty bold lead.
    expect(data.register.map((r) => r.lead)).toEqual(["Anton", "Müller"]);
    const mueller = data.register.find((r) => r.lead === "Müller")!;
    expect(mueller.rest).toBe(", Bundesvogt"); // no leading surname repeated, breadcrumb only
  });
});

describe("issue #1 — deceased members stay on the memorial after their tenure is ended", () => {
  it("includes a deceased person whose only assignment carries an end date", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [
        person({ id: 1, firstName: "Ver", lastName: "Storben", scoutName: "engel", deathDate: "2024-03-01" }),
        person({ id: 2, firstName: "Ge", lastName: "Heim", doNotPrint: true, deathDate: "2024-01-01" }),
      ],
      assignments: [
        // Tenure ended when the holder died (holder-warning flow): no active assignment left.
        { id: 1, personId: 1, groupId: 1, officeId: 1, endDate: "2024-03-01" },
        { id: 2, personId: 2, groupId: 1, officeId: 2, endDate: "2024-01-01" },
      ],
    };
    const data = buildProfileData(raw, "komplett", ALL_OPTIONS);
    expect(data.memorial).toContain("Ver Storben (engel)");
    // Deceased still never appear in the tree or the register.
    expect(allEntries(data.sections).some((e) => e.name === "Ver Storben")).toBe(false);
    expect(data.register.some((r) => r.rest.includes("Storben"))).toBe(false);
    // do_not_print is still honoured on the memorial.
    expect(data.memorial.some((m) => m.includes("Heim"))).toBe(false);
  });

  it("sorts the memorial by Nachname/Vorname as separate fields, like the register", () => {
    // Same trap as the register (see „issue #8" above): joining Nachname and Vorname into one
    // string lets the separator join the comparison. Joined, "meyer auf der heide anna" beats
    // "meyer christa" ('a' < 'c') and "habicht ii aaron" beats "habicht zoe" ('i' < 'z') — both
    // wrong, and both inconsistent with the register on the very same people.
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [
        person({ id: 1, firstName: "Christa", lastName: "Meyer", deathDate: "2024-01-01" }),
        person({ id: 2, firstName: "Anna", lastName: "Meyer auf der Heide", deathDate: "2024-01-02" }),
        person({ id: 3, firstName: "Aaron", lastName: "Habicht II", deathDate: "2024-01-03" }),
        person({ id: 4, firstName: "Zoe", lastName: "Habicht", deathDate: "2024-01-04" }),
      ],
      assignments: [
        { id: 1, personId: 1, groupId: 1, officeId: 1, endDate: "2024-01-01" },
        { id: 2, personId: 2, groupId: 1, officeId: 2, endDate: "2024-01-02" },
        { id: 3, personId: 3, groupId: 1, officeId: 3, endDate: "2024-01-03" },
        { id: 4, personId: 4, groupId: 1, officeId: 7, endDate: "2024-01-04" },
      ],
    };
    const data = buildProfileData(raw, "komplett", ALL_OPTIONS);
    expect(data.memorial).toEqual([
      "Zoe Habicht",
      "Aaron Habicht II",
      "Christa Meyer",
      "Anna Meyer auf der Heide",
    ]);
  });

  it("excludes a deceased person whose memberships are all out of the profile scope", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [person({ id: 1, firstName: "Wrong", lastName: "Section", deathDate: "2024-03-01" })],
      // Only a bundesgilde membership; nurBundesaemter excludes that section.
      assignments: [{ id: 1, personId: 1, groupId: 5, officeId: null, endDate: "2024-03-01" }],
    };
    const data = buildProfileData(raw, "nurBundesaemter", ALL_OPTIONS);
    expect(data.memorial).toEqual([]);
  });
});

describe("issue #3 — register breadcrumb dedups groups and lists parent before child", () => {
  it("prints a shared parent once and orders parent-before-child", () => {
    const raw: RawData = {
      ranks: RANKS,
      offices: OFFICES,
      groups: GROUPS,
      persons: [person({ id: 1, firstName: "Doppel", lastName: "Meier" })],
      assignments: [
        // child subgroup (sortKey 0): Knappenmeister in Jungenschaft Hohenlohe
        { id: 1, personId: 1, groupId: 3, officeId: 5, endDate: null },
        // parent group (sortKey 110): Gauvogt in Gau Franken
        { id: 2, personId: 1, groupId: 2, officeId: 4, endDate: null },
      ],
    };
    const data = buildProfileData(raw, "komplett", NO_OPTIONS);
    expect(data.register).toHaveLength(1);
    const rest = data.register[0].rest;
    expect(rest).toBe(" Meier, Gau Franken, Gauvogt, Jungenschaft Hohenlohe, Knappenmeister");
    // "Gau Franken" is not duplicated, and never appears before its own listing as a child parent.
    expect(rest.match(/Gau Franken/g)).toHaveLength(1);
  });
});
