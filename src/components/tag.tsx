import { cn } from "@/lib/utils";

const TONES = {
  /** Plain label on a record (Amt, Verteiler, provenance). */
  neutral: "border-line bg-surface-2 text-ink-soft",
  /** Something that needs attention (nicht abdrucken, fehlgeschlagen). */
  crit: "border-crit/30 bg-crit-tint font-medium text-crit",
  /** Small identifying mark (Verteiler on an Amt). */
  brass: "border-brass/40 bg-brass-tint text-ink-soft",
} as const;

/** The one recipe for small chips on a record. */
export function Tag({
  tone = "neutral",
  icon: Icon,
  title,
  className,
  children,
}: {
  /** neutral (default) | crit | brass. */
  tone?: keyof typeof TONES;
  /** Leading icon (decorative), kept outside the truncated text. */
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Tooltip with the full text (long values are truncated). */
  title?: string;
  /** Extra classes, e.g. a max width. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 max-w-full shrink-0 items-center gap-1 rounded-[4px] border px-1.5 text-caption leading-none whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
        TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon aria-hidden /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
