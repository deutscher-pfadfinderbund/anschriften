import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { downloadFile, filenameFromDisposition, SessionExpiredError } from "./download";

describe("filenameFromDisposition", () => {
  it("reads the quoted or bare filename", () => {
    expect(filenameFromDisposition(`attachment; filename="verzeichnis.pdf"`)).toBe("verzeichnis.pdf");
    expect(filenameFromDisposition(`attachment; filename=verzeichnis.pdf`)).toBe("verzeichnis.pdf");
  });

  it("returns null without a usable header", () => {
    expect(filenameFromDisposition(null)).toBeNull();
    expect(filenameFromDisposition("attachment")).toBeNull();
  });
});

describe("downloadFile error classification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubFetch = (res: Partial<Response>) =>
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, redirected: false, ...res })));

  it("treats 401 as an expired session", async () => {
    stubFetch({ ok: false, status: 401 });
    await expect(downloadFile("/api/export/pdf", "x.pdf")).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("treats a redirect (to the login page) as an expired session, never as the file", async () => {
    stubFetch({ ok: true, status: 200, redirected: true });
    await expect(downloadFile("/api/export/csv?ids=1", "x.csv")).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("treats any other failure as a generic error", async () => {
    stubFetch({ ok: false, status: 500 });
    const err = await downloadFile("/api/export/pdf", "x.pdf").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SessionExpiredError);
  });
});
