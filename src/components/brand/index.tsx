import Image from "next/image";

import { cn } from "@/lib/utils";

import lilie from "./dpb-lilie.png";

/**
 * The Lilie from the DPB letterhead emblem (sidebar, mobile top bar, standalone
 * pages), as printed: a white lily with black shading, its black field trimmed to a
 * thin band around it. The same image in light and dark. Set the height through
 * className. Decorative: the wordmark or title next to it already names the page.
 */
export function Lilie({ className }: { className?: string }) {
  return <Image src={lilie} alt="" unoptimized className={cn("w-auto shrink-0", className)} />;
}
