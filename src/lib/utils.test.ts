import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { cn, matchesQuery } from "./utils";

// All test data below is fictitious.

describe("matchesQuery", () => {
  it("matches every query word in any order, umlaut-insensitive", () => {
    expect(matchesQuery("Müller, Anna", "anna müller")).toBe(true);
    expect(matchesQuery("Müller, Anna", "mueller")).toBe(true);
    expect(matchesQuery("Müller, Anna", "  ANNA  ")).toBe(true);
  });

  it("fails as soon as one word is missing", () => {
    expect(matchesQuery("Müller, Anna", "anna schmidt")).toBe(false);
  });

  it("matches everything for an empty query", () => {
    expect(matchesQuery("Müller, Anna", "")).toBe(true);
  });
});

describe("cn", () => {
  // The custom scale from globals.css has to be registered with tailwind-merge
  // by hand; an unregistered token would be taken for a text colour and
  // silently drop `text-ink` (or vice versa).
  const css = readFileSync(path.join(__dirname, "../app/globals.css"), "utf8");
  const tokens = (prefix: string) =>
    [...css.matchAll(new RegExp(`--${prefix}-([a-z]+):`, "g"))].map((m) => m[1]);

  it.each(tokens("text"))("keeps text-%s apart from text colours", (size) => {
    expect(cn("text-ink", `text-${size}`)).toBe(`text-ink text-${size}`);
    expect(cn("text-ui", `text-${size}`)).toBe(`text-${size}`);
  });

  it.each(tokens("spacing"))("treats %s as a spacing value", (space) => {
    expect(cn("px-4", `px-${space}`)).toBe(`px-${space}`);
  });

  it("finds the scale in globals.css", () => {
    expect(tokens("text").length).toBeGreaterThan(0);
    expect(tokens("spacing").length).toBeGreaterThan(0);
  });
});
