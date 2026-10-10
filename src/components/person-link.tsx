import Link from "next/link";

import { Tag } from "@/components/tag";
import { formatName, isVacant, scoutAddition, type PersonName } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "Nachname, Vorname „Fahrtenname“" (or a „vakant“ chip) linking to the editor; `stretched` covers the card around it. */
export function PersonLink({ person, stretched = false }: { person: PersonName & { id: number }; stretched?: boolean }) {
  const scout = scoutAddition(person);
  return (
    <Link
      href={`/personen/${person.id}`}
      // Long lists (~600 links, twice in the directory): no prefetching, a click loads the editor.
      prefetch={false}
      className={cn(
        "rounded-sm font-medium text-ink transition-colors hover:text-fir",
        stretched && "before:absolute before:inset-0",
      )}
    >
      {isVacant(person) ? (
        <Tag tone="brass" title="Platzhalter ohne Namen: das Amt ist unbesetzt">
          vakant
        </Tag>
      ) : (
        formatName(person)
      )}
      {scout ? <span className="font-normal text-ink-soft"> „{scout}“</span> : null}
    </Link>
  );
}
