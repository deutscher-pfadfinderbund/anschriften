"use client";

import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A collapsible card (Panel's sibling): a native <details>, so keyboard and screen readers
 * get an expandable control for free. The summary row shows a chevron, the label and a
 * quiet count on the right. Pass `open`/`onOpenChange` to control it.
 */
export function Disclosure({
  summary,
  count,
  open,
  onOpenChange,
  className,
  children,
}: {
  summary: React.ReactNode;
  count: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      open={open}
      onToggle={(e) => onOpenChange?.(e.currentTarget.open)}
      className={cn("group min-w-0 rounded-lg border border-line bg-surface", className)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 text-ui font-medium text-ink transition-colors select-none group-open:rounded-b-none hover:bg-hover sm:px-gutter [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-faint transition-transform group-open:rotate-90" />
        {summary}
        <span className="ml-auto text-caption font-normal text-ink-faint tabular-nums">{count}</span>
      </summary>
      <div className="border-t border-line p-4 sm:p-gutter">{children}</div>
    </details>
  );
}
