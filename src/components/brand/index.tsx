import { cn } from "@/lib/utils";

import lilie from "./dpb-lilie.png";

const MASK = `url(${lilie.src}) center / contain no-repeat`;

/**
 * The Lilie from the DPB letterhead emblem, cut free of its black field (sidebar,
 * mobile top bar, standalone pages). Drawn as a mask filled with the ink token, so
 * it follows light and dark without a second image; forced-color-adjust keeps the
 * ink in Windows High Contrast, where the background would otherwise be repainted
 * away. Keeps its aspect ratio: set the height through className. Decorative: the
 * wordmark or title next to it already names the page.
 */
export function Lilie({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("block shrink-0 bg-ink forced-color-adjust-none", className)}
      style={{ aspectRatio: `${lilie.width} / ${lilie.height}`, mask: MASK, WebkitMask: MASK }}
    />
  );
}
