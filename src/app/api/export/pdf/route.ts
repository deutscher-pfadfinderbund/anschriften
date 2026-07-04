// PDF export route handler (issue #5). GET /api/export/pdf?profile=…&birthdays=1&ranks=1&memorial=0
// Runs on the Node runtime (spawns the Typst CLI) and is never cached.
import { buildData, isProfile, type BuildOptions } from "@/pdf/build-data";
import { compilePdf } from "@/pdf/compile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  // TODO(#1): once src/lib/auth.ts exists (parallel M1 merge), require a valid
  // `auth.api.getSession()` here and return 401 otherwise. Until then access is guarded only
  // by the (app) layout / proxy that M1 introduces.

  const params = new URL(request.url).searchParams;
  const profile = params.get("profile") ?? "";
  if (!isProfile(profile)) {
    return new Response("Unbekanntes Profil.", { status: 400 });
  }

  const options: BuildOptions = {
    withBirthdays: params.get("birthdays") === "1",
    withRanks: params.get("ranks") === "1",
    withMemorial: params.get("memorial") === "1",
  };

  let pdf: Buffer;
  let date: string;
  try {
    const data = await buildData(profile, options);
    date = data.date;
    pdf = await compilePdf(data);
  } catch (err) {
    const cause = err as NodeJS.ErrnoException;
    if (cause?.code === "ENOENT") {
      console.error("PDF export failed: typst binary not found in PATH", err);
      return new Response("PDF-Erzeugung nicht verfügbar: Typst ist auf dem Server nicht installiert.", {
        status: 500,
      });
    }
    console.error("PDF export failed", err);
    return new Response("PDF-Erzeugung fehlgeschlagen. Details stehen im Server-Log.", { status: 500 });
  }

  const filename = `anschriftenverzeichnis-${profile}-${date.replace(/\./g, "-")}.pdf`;
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
