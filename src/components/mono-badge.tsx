/**
 * Small neutral chip for numeric keys (Amts-Rang, Sortierung, Sortierschlüssel).
 * Right-aligned and tabular so a column of them lines up.
 */
export function MonoBadge({
  children,
  title,
}: {
  children: React.ReactNode;
  /** Tooltip, e.g. to spell out a placeholder value like „ohne Rang“. */
  title?: string;
}) {
  return (
    <span
      title={title}
      className="min-w-8 shrink-0 rounded-[4px] border border-line bg-surface-2 px-1.5 py-px text-right font-mono text-[11px] tabular-nums text-ink-faint"
    >
      {children}
    </span>
  );
}
