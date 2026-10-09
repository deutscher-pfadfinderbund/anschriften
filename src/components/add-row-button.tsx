import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

/** Dashed full-width "add another …" row inside a form (phone numbers, Ämter, history). */
export function AddRowButton({
  className,
  children,
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(
        "flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong px-3 py-2 text-caption text-ink-soft transition-colors hover:border-ink-faint hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <Plus aria-hidden className="size-3.5 shrink-0" />
      {children}
    </button>
  );
}
