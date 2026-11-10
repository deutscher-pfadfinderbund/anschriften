import { cn } from "@/lib/utils";

import lilieDark from "./dpb-lilie-dark.png";
import lilie from "./dpb-lilie.png";

const mask = (src: string) => {
  const m = `url(${src}) center / contain no-repeat`;
  return { mask: m, WebkitMask: m };
};

/**
 * The Lilie from the DPB letterhead emblem (sidebar, mobile top bar, standalone
 * pages), never inverted: a white lily with black shading, as printed. Without the
 * emblem's black field, so light mode draws the emblem's black (shading, lines, a
 * thin band of the field) on the paper, dark mode the white lily on the dark page.
 * Both are masks filled with the ink token, stacked, and light-dark() shows one;
 * forced-color-adjust keeps the ink in Windows High Contrast. Keeps its aspect
 * ratio (both images share one canvas): set the height through className.
 * Decorative: the wordmark or title next to it already names the page.
 */
export function Lilie({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 forced-color-adjust-none *:col-start-1 *:row-start-1", className)}
      style={{ aspectRatio: `${lilie.width} / ${lilie.height}` }}
    >
      <span className="bg-[light-dark(var(--ink),transparent)]" style={mask(lilie.src)} />
      <span className="bg-[light-dark(transparent,var(--ink))]" style={mask(lilieDark.src)} />
    </span>
  );
}
