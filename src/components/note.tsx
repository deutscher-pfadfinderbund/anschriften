import { cn } from "@/lib/utils";

const TONES = {
  neutral: "border-line bg-surface-2 text-ink-soft",
  crit: "border-crit/40 bg-crit-tint text-ink",
} as const;

/** The one boxed note: a hint or summary in a form (neutral), a failed login (crit). */
export function Note({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"div"> & { tone?: keyof typeof TONES }) {
  return <div className={cn("rounded-md border px-3 py-2 text-ui", TONES[tone], className)} {...props} />;
}
