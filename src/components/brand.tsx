import { cn } from "@/lib/utils";

/** The ink Raute (lozenge): the product's only mark — sidebar eyebrow, mobile top bar, standalone card, favicon. */
export function Raute({ className }: { className?: string }) {
  // shrink-0: a long name next to it must never squeeze the mark away.
  return <span aria-hidden className={cn("shrink-0 rotate-45 bg-brand", className)} />;
}

/** The "Deutscher Pfadfinderbund" overline above the product name. */
export function BundEyebrow() {
  return <p className="eyebrow">Deutscher Pfadfinderbund</p>;
}
