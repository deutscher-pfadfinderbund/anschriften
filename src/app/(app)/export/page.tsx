import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requirePageSession } from "@/lib/auth-helpers";

import { ExportManager } from "./export-manager";

export const metadata: Metadata = { title: "PDF-Export" };

// PDF export screen (issue #5). Slim server component: shared page header plus the
// interactive form (profile picker, options, download) in ExportManager.
export default async function ExportPage() {
  // Authoritative gate: the layout is not re-rendered on RSC navigations.
  await requirePageSession();
  return (
    <>
      <PageHeader
        title="PDF-Export"
        subtitle="Anschriftenverzeichnis als druckfertiges PDF erzeugen. Wähle ein Profil und die gewünschten Optionen."
      />
      <div className="px-6 pt-[18px] pb-10">
        <div className="max-w-3xl">
          <ExportManager />
        </div>
      </div>
    </>
  );
}
