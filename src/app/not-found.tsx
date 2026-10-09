// German 404 page. Shown when a route (e.g. a person id that no longer exists)
// cannot be found, in place of Next's default English screen.
import Link from "next/link";

import { StandaloneCard } from "@/components/standalone-card";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <StandaloneCard title="Seite nicht gefunden" className="text-center">
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
