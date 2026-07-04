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
    expect(list1.get(10)).toEqual({ manual: true, viaOfficeIds: [100] });
  });

  it("includes an office holder as a rule-based member", () => {
    const result = computeEffectiveMembership({
      manualMembers: [],
      officeRules: [{ listId: 1, officeId: 100 }],
      officeAssignments: [{ personId: 20, officeId: 100, endDate: null }],
    });
    expect(result.get(1)!.get(20)).toEqual({ manual: false, viaOfficeIds: [100] });
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
    expect(list1.get(30)).toEqual({ manual: true, viaOfficeIds: [] });
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
    expect(result.get(1)!.get(60)).toEqual({ manual: false, viaOfficeIds: [100] });
    const list2 = result.get(2)!;
    expect(list2.get(50)).toEqual({ manual: true, viaOfficeIds: [] });
    expect(list2.get(60)).toEqual({ manual: false, viaOfficeIds: [100] });
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
    expect(list1.get(71)).toEqual({ manual: false, viaOfficeIds: [100] });
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
    expect(result.get(1)!.get(80)).toEqual({ manual: false, viaOfficeIds: [100] });
  });

  it("drops a list whose only holder's tenure has ended", () => {
    const result = computeEffectiveMembership({
      manualMembers: [],
      officeRules: [{ listId: 1, officeId: 100 }],
      officeAssignments: [{ personId: 90, officeId: 100, endDate: "2020-06-30" }],
    });
    expect(result.get(1)).toBeUndefined();
  });
});
