import { cn } from "@/lib/utils";

/** The fir Raute (lozenge): the product's only mark — wordmark, standalone card, favicon. */
export function Raute({ className }: { className?: string }) {
  // shrink-0: a long name next to it must never squeeze the mark away.
  return <span aria-hidden className={cn("shrink-0 rotate-45 bg-fir", className)} />;
}

/** The "Deutscher Pfadfinderbund" overline above the product name. */
export function BundEyebrow({ className }: { className?: string }) {
  return <p className={cn("eyebrow", className)}>Deutscher Pfadfinderbund</p>;
}
