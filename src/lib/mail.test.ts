import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SMTP transport and the DB write so the failure path can be exercised
// without a real SMTP server or database.
const sendMailMock = vi.fn();
const createTransportMock = vi.fn<(opts: Record<string, unknown>) => unknown>(() => ({
  sendMail: sendMailMock,
  close: () => {},
}));
vi.mock("nodemailer", () => ({
  default: { createTransport: (opts: Record<string, unknown>) => createTransportMock(opts) },
}));

const insertValuesMock = vi.fn();
vi.mock("@/db", () => ({
  db: { insert: () => ({ values: insertValuesMock }) },
}));
vi.mock("@/db/schema", () => ({ mailLog: {} }));

import {
  bccChunkSize,
  chunk,
  isMailEnabled,
  mailFailureMessage,
  sanitizeMailError,
  sendListMail,
} from "./mail";

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

describe("sendListMail failure path masks recipient PII", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.SMTP_HOST = "localhost";
    process.env.MAIL_FROM = "Kanzlei <kanzlei@example.org>";
    sendMailMock.mockReset();
    insertValuesMock.mockReset();
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("sanitizes both the logged and the returned error (no raw recipient address)", async () => {
    // SMTP rejection that echoes a recipient address, like a real bounce would.
    sendMailMock.mockRejectedValue(
      Object.assign(new Error("550 5.1.1 <opfer@example.org>: Recipient unknown"), {
        code: "EENVELOPE",
        responseCode: 550,
      }),
    );

    const result = await sendListMail({
      subject: "Test",
      body: "Hallo",
      recipients: ["opfer@example.org"],
      sentBy: "Kanzler",
      listId: null,
    });

    // (a) what was written to mail_log.error is sanitized …
    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    const logged = insertValuesMock.mock.calls[0][0] as { status: string; error: string };
    expect(logged.status).toBe("failed");
    expect(logged.error).not.toContain("opfer@example.org");
    expect(logged.error).toContain("<redacted>");

    // (b) … and so is what is returned to the caller (which the toast shows).
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).not.toContain("opfer@example.org");
    expect(result.error).toContain("<redacted>");
    expect(result.error).toContain("SMTP 550");
    // Both surfaces carry the identical sanitized string.
    expect(result.error).toBe(logged.error);
  });
});

describe("sendListMail partial failure (chunked BCC)", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.SMTP_HOST = "localhost";
    process.env.MAIL_FROM = "Kanzlei <kanzlei@example.org>";
    process.env.MAIL_BCC_CHUNK_SIZE = "2";
    sendMailMock.mockReset();
    insertValuesMock.mockReset();
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  const recipients = ["a@example.org", "b@example.org", "c@example.org", "d@example.org", "e@example.org"];

  it("counts the recipients of every delivered chunk and logs where it stopped", async () => {
    // Chunks of 2: the first two go out, the third call fails.
    sendMailMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error("421 too many messages"), { responseCode: 421 }));

    const result = await sendListMail({ subject: "S", body: "B", recipients, sentBy: "K" });

    expect(sendMailMock).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ ok: false, sent: 4, recipientCount: 5 });
    const logged = insertValuesMock.mock.calls[0][0] as { status: string; error: string; recipientCount: number };
    expect(logged.status).toBe("failed");
    expect(logged.recipientCount).toBe(5);
    expect(logged.error).toMatch(/^Abgebrochen nach 4 von 5 Empfängern: /);
  });

  it("counts addresses the server refused in an accepted chunk as refused, not delivered", async () => {
    // nodemailer resolves when only some RCPTs fail and lists them in `rejected`.
    sendMailMock
      .mockResolvedValueOnce({ accepted: ["kanzlei@example.org", "a@example.org"], rejected: ["B@example.org"] })
      .mockResolvedValueOnce({ accepted: ["kanzlei@example.org", "c@example.org", "d@example.org"], rejected: [] })
      .mockRejectedValueOnce(new Error("421 too many messages"));

    const result = await sendListMail({ subject: "S", body: "B", recipients, sentBy: "K" });

    expect(result).toMatchObject({ ok: false, sent: 3, recipientCount: 5 });
    const logged = insertValuesMock.mock.calls[0][0] as { error: string };
    expect(logged.error).toMatch(/^Abgebrochen nach 3 von 5 Empfängern: /);
  });

  it("reports refusals of a completed mailing in the result and the log, without addresses", async () => {
    sendMailMock
      .mockResolvedValueOnce({ rejected: [{ name: "", address: "a@example.org" }] })
      .mockResolvedValue({ rejected: [] });

    const result = await sendListMail({ subject: "S", body: "B", recipients, sentBy: "K" });

    expect(result).toEqual({ ok: true, chunks: 3, recipientCount: 5, refused: 1 });
    const logged = insertValuesMock.mock.calls[0][0] as { status: string; error: string };
    expect(logged.status).toBe("sent");
    expect(logged.error).toBe("1 von 5 Empfängern vom Mailserver abgelehnt");
  });

  it("reports sent = 0 when the very first chunk fails", async () => {
    sendMailMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await sendListMail({ subject: "S", body: "B", recipients, sentBy: "K" });
    expect(result).toMatchObject({ ok: false, sent: 0 });
    const logged = insertValuesMock.mock.calls[0][0] as { error: string };
    expect(logged.error).not.toMatch(/Abgebrochen/);
  });

  it("still reports a delivered mailing as sent when the log write fails", async () => {
    sendMailMock.mockResolvedValue({});
    insertValuesMock.mockRejectedValue(new Error("db down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendListMail({ subject: "S", body: "B", recipients, sentBy: "K" });
    expect(result).toEqual({ ok: true, chunks: 3, recipientCount: 5, refused: 0 });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("mailFailureMessage", () => {
  it("tells the user not to resend after a partial send", () => {
    const msg = mailFailureMessage({ error: "SMTP 421", sent: 50, recipientCount: 120 });
    expect(msg).toContain("50 von 120 Empfängern haben die E-Mail bereits erhalten");
    expect(msg).toContain("nicht noch einmal an alle senden");
    expect(msg).toContain("SMTP 421");
  });

  it("is a plain failure when nothing went out", () => {
    expect(mailFailureMessage({ error: "ECONNREFUSED", sent: 0, recipientCount: 10 })).toBe(
      "E-Mail-Versand fehlgeschlagen: ECONNREFUSED",
    );
  });
});

describe("sendListMail transport options", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.SMTP_HOST = "localhost";
    process.env.MAIL_FROM = "Kanzlei <kanzlei@example.org>";
    delete process.env.SMTP_USER;
    delete process.env.SMTP_SECURE;
    sendMailMock.mockReset().mockResolvedValue({});
    insertValuesMock.mockReset();
    createTransportMock.mockClear();
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  const send = () => sendListMail({ subject: "S", body: "B", recipients: ["a@example.org"], sentBy: "K" });

  it("does not require STARTTLS for an auth-less relay (Mailpit)", async () => {
    await send();
    const opts = createTransportMock.mock.calls[0][0];
    expect(opts.requireTLS).toBeUndefined();
    expect(opts.auth).toBeUndefined();
  });

  it("requires STARTTLS when credentials are sent on a non-TLS port", async () => {
    process.env.SMTP_USER = "kanzlei";
    process.env.SMTP_PASS = "geheim";
    await send();
    const opts = createTransportMock.mock.calls[0][0];
    expect(opts.requireTLS).toBe(true);
    expect(opts.auth).toEqual({ user: "kanzlei", pass: "geheim" });
  });

  it("uses implicit TLS without requireTLS when SMTP_SECURE=true", async () => {
    process.env.SMTP_USER = "kanzlei";
    process.env.SMTP_SECURE = "true";
    await send();
    const opts = createTransportMock.mock.calls[0][0];
    expect(opts.secure).toBe(true);
    expect(opts.requireTLS).toBeUndefined();
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
