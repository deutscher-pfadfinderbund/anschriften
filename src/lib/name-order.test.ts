import { describe, expect, it } from "vitest";

import { formatName } from "@/lib/format";
import { byDirectoryName } from "@/lib/name-order";

const person = (lastName: string | null, firstName: string | null, scoutName: string | null = null) => ({
  lastName,
  firstName,
  scoutName,
});

const order = (people: ReturnType<typeof person>[]) => [...people].sort(byDirectoryName).map(formatName);

describe("byDirectoryName", () => {
  it("keeps a surname together before longer hyphenated or multi-word surnames", () => {
    expect(
      order([
        person("Schmidt-Meyer", "Xaver"),
        person("Schmidt", "David"),
        person("Schmidt Brandt", "Bea"),
        person("Schmidt", "Anna"),
      ]),
    ).toEqual(["Schmidt, Anna", "Schmidt, David", "Schmidt Brandt, Bea", "Schmidt-Meyer, Xaver"]);
  });

  it("folds umlauts like the directory (ü = ue) and orders namesakes by first name", () => {
    expect(order([person("Müller", "Jonas"), person("Mueller", "Anna"), person("Muff", "Carl")])).toEqual([
      "Mueller, Anna",
      "Müller, Jonas",
      "Muff, Carl",
    ]);
  });

  it("uses the scout name when there is no last name", () => {
    expect(order([person("Zander", "Paul"), person(null, null, "Igel"), person("Adler", "Eva")])).toEqual([
      "Adler, Eva",
      "Igel",
      "Zander, Paul",
    ]);
  });
});
