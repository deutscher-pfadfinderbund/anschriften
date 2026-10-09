import { describe, expect, it } from "vitest";

import {
  computeEffectiveMembership,
  type EffectiveMembershipInput,
  type MembershipAssignment,
  type MembershipRule,
} from "./effective-members";

// Fictional ids throughout — no real person data.

/** Every field is required by the real input; tests only spell out what they exercise. */
function input(over: Partial<EffectiveMembershipInput>): EffectiveMembershipInput {
  return { manualMembers: [], rules: [], assignments: [], persons: [], ...over };
}

const officeRule = (listId: number, targetId: number): MembershipRule => ({ listId, kind: "office", targetId });
const rankRule = (listId: number, targetId: number): MembershipRule => ({ listId, kind: "rank", targetId });
const groupRule = (listId: number, targetId: number): MembershipRule => ({ listId, kind: "group", targetId });

/** An assignment in Gliederung 1 (never ruled below unless a test says so). */
function holds(personId: number, officeId: number | null, endDate: string | null = null, groupId = 1): MembershipAssignment {
  return { personId, groupId, officeId, endDate };
}

describe("computeEffectiveMembership", () => {
  it("unions manual and rule-based members and dedupes to one entry", () => {
    // List 1 has a manual member (person 10) and a rule on office 100, held by person 10.
    const result = computeEffectiveMembership(
      input({
        manualMembers: [{ listId: 1, personId: 10 }],
        rules: [officeRule(1, 100)],
        assignments: [holds(10, 100)],
      }),
    );
    const list1 = result.get(1)!;
    expect(list1.size).toBe(1);
    expect(list1.get(10)).toEqual({ manual: true, via: [{ kind: "office", id: 100 }] });
  });

  it("includes an office holder as a rule-based member", () => {
    const result = computeEffectiveMembership(
      input({ rules: [officeRule(1, 100)], assignments: [holds(20, 100)] }),
    );
    expect(result.get(1)!.get(20)).toEqual({ manual: false, via: [{ kind: "office", id: 100 }] });
  });

  it("excludes deceased persons entirely — manual memberships included", () => {
    const result = computeEffectiveMembership(
      input({
        manualMembers: [
          { listId: 1, personId: 30 },
          { listId: 1, personId: 32 },
        ],
        rules: [officeRule(1, 100)],
        // 30 (manual + rule, deceased), 31 (rule only, deceased), 32 (manual, living).
        assignments: [holds(30, 100), holds(31, 100)],
        persons: [
          { id: 30, rankId: null, deathDate: "2024-03-01" },
          { id: 31, rankId: null, deathDate: "2023-01-01" },
          { id: 32, rankId: null, deathDate: null },
        ],
      }),
    );
    const list1 = result.get(1)!;
    expect(list1.has(30)).toBe(false);
    expect(list1.has(31)).toBe(false);
    expect(list1.get(32)).toEqual({ manual: true, via: [] });
    expect(list1.size).toBe(1);
  });

  it("drops a list whose only manual member is deceased", () => {
    const result = computeEffectiveMembership(
      input({
        manualMembers: [{ listId: 1, personId: 33 }],
        persons: [{ id: 33, rankId: null, deathDate: "2024-03-01" }],
      }),
    );
    expect(result.get(1)).toBeUndefined();
  });

  it("dedupes via when one person is reached through two rule-offices", () => {
    const result = computeEffectiveMembership(
      input({
        rules: [officeRule(1, 100), officeRule(1, 101)],
        assignments: [holds(40, 100), holds(40, 101)],
      }),
    );
    const list1 = result.get(1)!;
    expect(list1.size).toBe(1);
    expect(list1.get(40)!.via).toEqual([
      { kind: "office", id: 100 },
      { kind: "office", id: 101 },
    ]);
  });

  it("credits a rule only once even if the same tenure appears twice", () => {
    // Repeated tenure of the same office: an ended one plus a current one.
    const result = computeEffectiveMembership(
      input({
        rules: [officeRule(1, 100)],
        assignments: [holds(80, 100, "2012-12-31"), holds(80, 100), holds(80, 100, null, 2)],
      }),
    );
    expect(result.get(1)!.get(80)).toEqual({ manual: false, via: [{ kind: "office", id: 100 }] });
  });

  it("keeps lists independent and credits the office each rule belongs to", () => {
    const result = computeEffectiveMembership(
      input({
        manualMembers: [{ listId: 2, personId: 50 }],
        rules: [officeRule(1, 100), officeRule(2, 100)],
        assignments: [holds(60, 100)],
      }),
    );
    expect(result.get(1)!.get(60)).toEqual({ manual: false, via: [{ kind: "office", id: 100 }] });
    const list2 = result.get(2)!;
    expect(list2.get(50)).toEqual({ manual: true, via: [] });
    expect(list2.get(60)).toEqual({ manual: false, via: [{ kind: "office", id: 100 }] });
  });

  it("returns no entry for a rule whose office has no living holder", () => {
    const result = computeEffectiveMembership(input({ rules: [officeRule(1, 999)] }));
    expect(result.get(1)).toBeUndefined();
  });

  // --- office history / active filter (issue #22) ---
  it("excludes ended tenures (end_date set) from the rule-based half", () => {
    const result = computeEffectiveMembership(
      input({
        rules: [officeRule(1, 100)],
        // Person 70 held office 100 in the past (ended); person 71 holds it now.
        assignments: [holds(70, 100, "2019-12-31"), holds(71, 100)],
      }),
    );
    const list1 = result.get(1)!;
    expect(list1.has(70)).toBe(false);
    expect(list1.get(71)).toEqual({ manual: false, via: [{ kind: "office", id: 100 }] });
    expect(list1.size).toBe(1);
  });

  it("drops a list whose only holder's tenure has ended", () => {
    const result = computeEffectiveMembership(
      input({ rules: [officeRule(1, 100)], assignments: [holds(90, 100, "2020-06-30")] }),
    );
    expect(result.get(1)).toBeUndefined();
  });

  // --- rank (Stand) rules ---
  it("includes everyone carrying a ruled Stand, living only", () => {
    const result = computeEffectiveMembership(
      input({
        rules: [rankRule(1, 500)],
        // 200 and 201 carry the Stand; 202 is deceased; 203 carries another Stand.
        persons: [
          { id: 200, rankId: 500, deathDate: null },
          { id: 201, rankId: 500, deathDate: null },
          { id: 202, rankId: 500, deathDate: "2022-02-02" },
          { id: 203, rankId: 501, deathDate: null },
        ],
      }),
    );
    const list1 = result.get(1)!;
    expect(list1.size).toBe(2);
    expect(list1.get(200)).toEqual({ manual: false, via: [{ kind: "rank", id: 500 }] });
    expect(list1.has(202)).toBe(false);
    expect(list1.has(203)).toBe(false);
  });

  it("combines a rank rule and an office rule for the same person", () => {
    const result = computeEffectiveMembership(
      input({
        rules: [officeRule(1, 100), rankRule(1, 500)],
        assignments: [holds(210, 100)],
        persons: [{ id: 210, rankId: 500, deathDate: null }],
      }),
    );
    expect(result.get(1)!.get(210)).toEqual({
      manual: false,
      via: [
        { kind: "office", id: 100 },
        { kind: "rank", id: 500 },
      ],
    });
  });

  // --- group (Gliederung) rules ---
  it("includes everyone actively assigned to a ruled Gliederung, living only", () => {
    const result = computeEffectiveMembership(
      input({
        rules: [groupRule(1, 900)],
        // 300 active (office-less), 301 active (with office), 302 ended, 303 deceased.
        assignments: [
          holds(300, null, null, 900),
          holds(301, 100, null, 900),
          holds(302, null, "2020-01-01", 900),
          holds(303, null, null, 900),
        ],
        persons: [{ id: 303, rankId: null, deathDate: "2021-01-01" }],
      }),
    );
    const list1 = result.get(1)!;
    expect(list1.size).toBe(2);
    expect(list1.get(300)).toEqual({ manual: false, via: [{ kind: "group", id: 900 }] });
    expect(list1.get(301)).toEqual({ manual: false, via: [{ kind: "group", id: 900 }] });
    expect(list1.has(302)).toBe(false); // ended tenure
    expect(list1.has(303)).toBe(false); // deceased
  });

  it("does not confuse an office id with a group id of the same number", () => {
    const result = computeEffectiveMembership(
      input({ rules: [groupRule(1, 100)], assignments: [holds(310, 100, null, 1)] }),
    );
    expect(result.get(1)).toBeUndefined();
  });

  it("credits all three rule kinds at once for the same person, deduped", () => {
    const result = computeEffectiveMembership(
      input({
        manualMembers: [{ listId: 1, personId: 400 }],
        rules: [officeRule(1, 100), rankRule(1, 500), groupRule(1, 900)],
        assignments: [holds(400, 100, null, 900)],
        persons: [{ id: 400, rankId: 500, deathDate: null }],
      }),
    );
    expect(result.get(1)!.get(400)).toEqual({
      manual: true,
      via: [
        { kind: "office", id: 100 },
        { kind: "rank", id: 500 },
        { kind: "group", id: 900 },
      ],
    });
  });
});
