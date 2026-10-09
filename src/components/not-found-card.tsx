import Link from "next/link";

import { StandaloneCard } from "@/components/standalone-card";
import { Button } from "@/components/ui/button";

/** The German 404: a route or a record (e.g. a deleted person) that does not exist. */
export function NotFoundCard({ as }: { as?: "main" | "div" }) {
  return (
    <StandaloneCard title="Seite nicht gefunden" className="text-center" as={as}>
      <p>
        Diese Seite oder dieser Eintrag existiert nicht (mehr). Vielleicht wurde er gelöscht
        oder der Link ist nicht korrekt.
      </p>
      <Button asChild size="lg" className="mt-6 w-full">
        <Link href="/">Zum Verzeichnis</Link>
      </Button>
    </StandaloneCard>
  );
}
