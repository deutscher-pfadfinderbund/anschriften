import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Quiet placeholder for empty lists: muted icon, the sentence stating what is
 * missing, an optional hint and an optional call to action. Meant to sit inside
 * a card body; pass `className` to adjust the vertical rhythm.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <Icon aria-hidden className="mb-3 size-6 text-ink-faint opacity-50" />
      <p className="text-[14px] text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-[13px] text-ink-faint">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
