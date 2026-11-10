import type { StaticImageData } from "next/image";

import { cn } from "@/lib/utils";

import lilie from "./dpb-lilie.png";
import schriftzug from "./dpb-schriftzug.png";

// Both marks come from the DPB letterhead (src/pdf/assets/DPB_Briefkopf.png). They
// are drawn as a mask filled with the ink token, so they follow light and dark
// without a second image; forced-color-adjust keeps the ink in Windows High
// Contrast, where the background would otherwise be repainted away. Each keeps its
// aspect ratio: set the width (Schriftzug) or the height (Lilie) through className.
function Mark({
  image,
  label,
  position,
  className,
}: {
  image: StaticImageData;
  /** Accessible name; without one the mark is decorative (aria-hidden). */
  label?: string;
  position: string;
  className?: string;
}) {
  const mask = `url(${image.src}) ${position} / contain no-repeat`;
  return (
    <span
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={cn("block shrink-0 bg-ink forced-color-adjust-none", className)}
      style={{ aspectRatio: `${image.width} / ${image.height}`, mask, WebkitMask: mask }}
    />
  );
}

/** The Lilie from the letterhead emblem, cut free of its black field (mobile top bar,
 * standalone pages). Decorative: the wordmark or title next to it already names the page. */
export function Lilie({ className }: { className?: string }) {
  return <Mark image={lilie} position="center" className={className} />;
}

/** The hand-lettered „Deutscher Pfadfinderbund“ from the letterhead. */
export function Schriftzug({ className }: { className?: string }) {
  return <Mark image={schriftzug} label="Deutscher Pfadfinderbund" position="left center" className={className} />;
}
