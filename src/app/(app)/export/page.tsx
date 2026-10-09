import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/page-header";
import { requirePageSession } from "@/lib/auth-helpers";

import { ExportManager } from "./export-manager";

export const metadata: Metadata = { title: "PDF-Export" };

// PDF export screen (issue #5): the shared page header plus the interactive form
// (profile, options, download) in ExportManager.
export default async function ExportPage() {
  await requirePageSession();
  return (
    <>
      <PageHeader
        title="PDF-Export"
        subtitle="Das Anschriftenverzeichnis als druckfertiges PDF – wähle ein Profil und die Optionen."
      />
      <PageBody>
        <ExportManager />
      </PageBody>
    </>
  );
}
