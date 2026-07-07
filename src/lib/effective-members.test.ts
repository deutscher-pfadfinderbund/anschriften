import { describe, expect, it } from "vitest";

import { computeEffectiveMembership } from "./effective-members";

// Fictional ids throughout — no real person data.
describe("computeEffectiveMembership", () => {
  it("unions manual and rule-based members and dedupes to one entry", () => {
    // List 1 has a manual member (person 10) and a rule on office 100, held by person 10.
    const result = computeEffectiveMembership({
      manualMembers: [{ listId: 1, personId: 10 }],
      officeRules: [{ listId: 1, officeId: 100 }],
      officeAssignments: [{ personId: 10, officeId: 100, endDate: null }],
    });
    const list1 = result.get(1)!;
    expect(list1.size).toBe(1);
    expect(list1.get(10)).toEqual({
      manual: true,
      viaOfficeIds: [100],
      viaRankIds: [],
      viaGroupIds: [],
    });
  });

  it("includes an office holder as a rule-based member", () => {
    const result = computeEffectiveMembership({
      manualMembers: [],
      officeRules: [{ listId: 1, officeId: 100 }],
      officeAssignments: [{ personId: 20, officeId: 100, endDate: null }],
    });
    expect(result.get(1)!.get(20)).toEqual({
      manual: false,
      viaOfficeIds: [100],
      viaRankIds: [],
      viaGroupIds: [],
    });
  });

  it("excludes deceased persons from the rule-based half but keeps them if manual", () => {
    const result = computeEffectiveMembership({
      manualMembers: [{ listId: 1, personId: 30 }],
      officeRules: [{ listId: 1, officeId: 100 }],
      // Both 30 (manual + deceased) and 31 (rule-only + deceased) hold office 100.
      officeAssignments: [
        { personId: 30, officeId: 100, endDate: null },
        { personId: 31, officeId: 100, endDate: null },
      ],
      deceasedPersonIds: [30, 31],
    });
    const list1 = result.get(1)!;
    // 30 stays via the manual membership, but is NOT credited to the rule.
    expect(list1.get(30)).toEqual({
      manual: true,
      viaOfficeIds: [],
      viaRankIds: [],
      viaGroupIds: [],
    });
    // 31 is only reachable via the rule and is deceased → excluded entirely.
    expect(list1.has(31)).toBe(false);
    expect(list1.size).toBe(1);
  });

  it("dedupes viaOfficeIds when one person is reached through two rule-offices", () => {
    const result = computeEffectiveMembership({
      manualMembers: [],
      officeRules: [
        { listId: 1, officeId: 100 },
        { listId: 1, officeId: 101 },
      ],
      officeAssignments: [
        { personId: 40, officeId: 100, endDate: null },
        { personId: 40, officeId: 101, endDate: null },
      ],
    });
    const list1 = result.get(1)!;
    expect(list1.size).toBe(1);
    expect(list1.get(40)!.viaOfficeIds.sort()).toEqual([100, 101]);
  });

  it("keeps lists independent and credits the office each rule belongs to", () => {
    const result = computeEffectiveMembership({
      manualMembers: [{ listId: 2, personId: 50 }],
      officeRules: [
        { listId: 1, officeId: 100 },
        { listId: 2, officeId: 100 },
      ],
      officeAssignments: [{ personId: 60, officeId: 100, endDate: null }],
    });
    expect(result.get(1)!.get(60)).toEqual({
      manual: false,
      viaOfficeIds: [100],
      viaRankIds: [],
      viaGroupIds: [],
    });
    const list2 = result.get(2)!;
    expect(list2.get(50)).toEqual({
      manual: true,
      viaOfficeIds: [],
      viaRankIds: [],
      viaGroupIds: [],
    });
    expect(list2.get(60)).toEqual({
      manual: false,
      viaOfficeIds: [100],
      viaRankIds: [],
      viaGroupIds: [],
    });
  });

  it("returns no entry for a rule whose office has no living holder", () => {
    const result = computeEffectiveMembership({
      manualMembers: [],
      officeRules: [{ listId: 1, officeId: 999 }],
      officeAssignments: [],
    });
    expect(result.get(1)).toBeUndefined();
  });

  // --- office history / active filter (issue #22) ---
  it("excludes ended tenures (end_date set) from the rule-based half", () => {
    const result = computeEffectiveMembership({
      manualMembers: [],
      officeRules: [{ listId: 1, officeId: 100 }],
      // Person 70 held office 100 in the past (ended); person 71 holds it now.
      officeAssignments: [
        { personId: 70, officeId: 100, endDate: "2019-12-31" },
        { personId: 71, officeId: 100, endDate: null },
      ],
    });
    const list1 = result.get(1)!;
    // Only the current holder is a member; the past holder is not.
    expect(list1.has(70)).toBe(false);
    expect(list1.get(71)).toEqual({
      manual: false,
      viaOfficeIds: [100],
      viaRankIds: [],
      viaGroupIds: [],
    });
    expect(list1.size).toBe(1);
  });

  it("keeps a person whose SAME office is both an ended and an active tenure", () => {
    const result = computeEffectiveMembership({
      manualMembers: [],
      officeRules: [{ listId: 1, officeId: 100 }],
      // Repeated tenure of the same office: 2010–2012 ended, plus a current one.
      officeAssignments: [
        { personId: 80, officeId: 100, endDate: "2012-12-31" },
        { personId: 80, officeId: 100, endDate: null },
      ],
    });
    expect(result.get(1)!.get(80)).toEqual({
      manual: false,
      viaOfficeIds: [100],
      viaRankIds: [],
      viaGroupIds: [],
    });
  });

  it("drops a list whose only holder's tenure has ended", () => {
    const result = computeEffectiveMembership({
      manualMembers: [],
      officeRules: [{ listId: 1, officeId: 100 }],
      officeAssignments: [{ personId: 90, officeId: 100, endDate: "2020-06-30" }],
    });
    expect(result.get(1)).toBeUndefined();
  });

  // --- rank (Stand) rules ---
  it("includes everyone carrying a ruled Stand, living only", () => {
    const result = computeEffectiveMembership({
      manualMembers: [],
      officeRules: [],
      rankRules: [{ listId: 1, rankId: 500 }],
      officeAssignments: [],
      // 200 and 201 carry the Stand; 202 is deceased and excluded.
      personRanks: [
        { personId: 200, rankId: 500 },
        { personId: 201, rankId: 500 },
        { personId: 202, rankId: 500 },
      ],
      deceasedPersonIds: [202],
    });
    const list1 = result.get(1)!;
    expect(list1.size).toBe(2);
    expect(list1.get(200)).toEqual({
      manual: false,
      viaOfficeIds: [],
      viaRankIds: [500],
      viaGroupIds: [],
    });
    expect(list1.has(202)).toBe(false);
  });

  it("dedupes a person reached via two ruled Stände is impossible, but a rank + office combine", () => {
    const result = computeEffectiveMembership({
      manualMembers: [],
      officeRules: [{ listId: 1, officeId: 100 }],
      rankRules: [{ listId: 1, rankId: 500 }],
      officeAssignments: [{ personId: 210, officeId: 100, endDate: null }],
      personRanks: [{ personId: 210, rankId: 500 }],
    });
    expect(result.get(1)!.get(210)).toEqual({
      manual: false,
      viaOfficeIds: [100],
      viaRankIds: [500],
      viaGroupIds: [],
    });
  });

  // --- group (Gliederung) rules ---
  it("includes everyone actively assigned to a ruled Gliederung, living only", () => {
    const result = computeEffectiveMembership({
      manualMembers: [],
      officeRules: [],
      groupRules: [{ listId: 1, groupId: 900 }],
      officeAssignments: [],
      // 300 active (office-less), 301 active (with office), 302 ended, 303 deceased.
      groupAssignments: [
        { personId: 300, groupId: 900, endDate: null },
        { personId: 301, groupId: 900, endDate: null },
        { personId: 302, groupId: 900, endDate: "2020-01-01" },
        { personId: 303, groupId: 900, endDate: null },
      ],
      deceasedPersonIds: [303],
    });
    const list1 = result.get(1)!;
    expect(list1.size).toBe(2);
    expect(list1.get(300)).toEqual({
      manual: false,
      viaOfficeIds: [],
      viaRankIds: [],
      viaGroupIds: [900],
    });
    expect(list1.has(302)).toBe(false); // ended tenure
    expect(list1.has(303)).toBe(false); // deceased
  });

  it("credits all three rule kinds at once for the same person, deduped", () => {
    const result = computeEffectiveMembership({
      manualMembers: [{ listId: 1, personId: 400 }],
      officeRules: [{ listId: 1, officeId: 100 }],
      rankRules: [{ listId: 1, rankId: 500 }],
      groupRules: [{ listId: 1, groupId: 900 }],
      officeAssignments: [{ personId: 400, officeId: 100, endDate: null }],
      groupAssignments: [{ personId: 400, groupId: 900, endDate: null }],
      personRanks: [{ personId: 400, rankId: 500 }],
    });
    expect(result.get(1)!.get(400)).toEqual({
      manual: true,
      viaOfficeIds: [100],
      viaRankIds: [500],
      viaGroupIds: [900],
    });
  });
});
