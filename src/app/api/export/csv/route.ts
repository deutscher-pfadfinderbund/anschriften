// CSV export route (issue #4). GET /api/export/csv?listId=… OR ?ids=1,2,3
// Runs on the Node runtime and is never cached. Session is required (401 otherwise);
// we resolve it inline rather than via the throwing requireSession() helper, so an
// unauthenticated request gets a clean 401 instead of a 500.
import { getListName, personsForCsvByIds, personsForCsvByList } from "@/db/queries";
import { auth } from "@/lib/auth";
import { asciiSlug, buildCsv, CSV_BOM, type CsvPerson } from "@/lib/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response("Nicht angemeldet.", { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const listIdRaw = params.get("listId");
  const idsRaw = params.get("ids");

  let rows: CsvPerson[];
  let baseName: string;

  if (listIdRaw != null) {
    const listId = Number(listIdRaw);
    if (!Number.isInteger(listId) || listId <= 0) {
      return new Response("Ungültige Verteiler-ID.", { status: 400 });
    }
    const [name, data] = await Promise.all([getListName(listId), personsForCsvByList(listId)]);
    rows = data;
    baseName = name ? asciiSlug(name) : `verteiler-${listId}`;
  } else if (idsRaw != null) {
    const ids = [
      ...new Set(
        idsRaw
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    ];
    if (ids.length === 0) {
      return new Response("Keine gültigen IDs übergeben.", { status: 400 });
    }
    // Sanity cap far above the real dataset (~700 persons) against abusive queries.
    if (ids.length > 5000) {
      return new Response("Zu viele IDs übergeben.", { status: 400 });
    }
    rows = await personsForCsvByIds(ids);
    baseName = "auswahl";
  } else {
    return new Response("Parameter listId oder ids erforderlich.", { status: 400 });
  }

  // BOM + CSV body. The BOM makes German Excel read UTF-8 correctly and satisfies
  // a byte-level check (first bytes EF BB BF).
  const body = CSV_BOM + buildCsv(rows);

  const date = new Date().toISOString().slice(0, 10);
  const filename = `anschriften-${baseName}-${date}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // filename is already ASCII (slugged); filename* is added for RFC 5987 completeness.
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
