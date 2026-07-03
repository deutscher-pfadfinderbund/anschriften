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

  const data = await buildData(profile, options);
  const pdf = await compilePdf(data);

  const filename = `anschriftenverzeichnis-${profile}-${data.date.replace(/\./g, "-")}.pdf`;
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
