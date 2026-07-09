import { PageHeader } from "@/components/page-header";

import { ExportManager } from "./export-manager";

// PDF export screen (issue #5). Slim server component: shared page header plus the
// interactive form (profile picker, options, download) in ExportManager.
export default function ExportPage() {
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
