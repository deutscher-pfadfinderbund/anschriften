import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bccChunkSize, chunk, isMailEnabled, normalizeRecipients, sanitizeMailError } from "./mail";

describe("chunk", () => {
  it("splits into consecutive chunks of at most size", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns a single chunk when size exceeds length", () => {
    expect(chunk([1, 2, 3], 50)).toEqual([[1, 2, 3]]);
  });

  it("returns no chunks for an empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("clamps a size below 1 to 1 (never an infinite loop)", () => {
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]);
    expect(chunk([1, 2], -5)).toEqual([[1], [2]]);
  });
});

describe("normalizeRecipients", () => {
  it("trims, drops blanks (counted), dedupes case-insensitively, keeps order", () => {
    const res = normalizeRecipients([
      "A@example.org",
      " b@example.org ",
      "",
      null,
      "a@example.org",
      undefined,
    ]);
    expect(res.recipients).toEqual(["A@example.org", "b@example.org"]);
    expect(res.skipped).toBe(3);
  });

  it("handles an all-empty input", () => {
    expect(normalizeRecipients([null, "", "  "])).toEqual({ recipients: [], skipped: 3 });
  });

  it("skips malformed legacy values instead of passing them to SMTP", () => {
    const res = normalizeRecipients([
      "a@x.de, b@y.de", // legacy double-address in one field
      "kein-at-zeichen",
      "leerzeichen @x.de",
      "ok@example.org",
    ]);
    expect(res.recipients).toEqual(["ok@example.org"]);
    expect(res.skipped).toBe(3);
  });
});

describe("sanitizeMailError", () => {
  it("keeps code + SMTP response code but masks recipient addresses", () => {
    const err = Object.assign(new Error("550 5.1.1 <opfer@example.org>: Recipient unknown"), {
      code: "EENVELOPE",
      responseCode: 550,
    });
    const out = sanitizeMailError(err);
    expect(out).toContain("EENVELOPE");
    expect(out).toContain("SMTP 550");
    expect(out).toContain("<redacted>");
    expect(out).not.toContain("opfer@example.org");
  });

  it("takes only the first line and never exceeds 500 chars", () => {
    const out = sanitizeMailError(new Error(`first line ${"x".repeat(1000)}\nsecond line`));
    expect(out).not.toContain("second line");
    expect(out.length).toBeLessThanOrEqual(500);
  });

  it("handles non-Error values", () => {
    expect(sanitizeMailError("boom")).toBe("boom");
    expect(sanitizeMailError(undefined)).toBe("Unbekannter Fehler");
  });
});

describe("isMailEnabled / bccChunkSize (read env at call time)", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.MAIL_FROM;
    delete process.env.MAIL_BCC_CHUNK_SIZE;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is disabled without SMTP_HOST or MAIL_FROM", () => {
    expect(isMailEnabled()).toBe(false);
    process.env.SMTP_HOST = "localhost";
    expect(isMailEnabled()).toBe(false);
    process.env.MAIL_FROM = "Kanzlei <kanzlei@example.org>";
    expect(isMailEnabled()).toBe(true);
  });

  it("treats blank values as unset", () => {
    process.env.SMTP_HOST = "   ";
    process.env.MAIL_FROM = "   ";
    expect(isMailEnabled()).toBe(false);
  });

  it("defaults the chunk size to 50 and clamps invalid values", () => {
    expect(bccChunkSize()).toBe(50);
    process.env.MAIL_BCC_CHUNK_SIZE = "2";
    expect(bccChunkSize()).toBe(2);
    process.env.MAIL_BCC_CHUNK_SIZE = "0";
    expect(bccChunkSize()).toBe(50);
    process.env.MAIL_BCC_CHUNK_SIZE = "abc";
    expect(bccChunkSize()).toBe(50);
  });
});
