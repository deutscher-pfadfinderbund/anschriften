/**
 * Small neutral box for a master-data row's Reihenfolge (Ämter, Stände, Gliederungen).
 * Fixed width and tabular figures, so a column of them lines up.
 */
export function NumberBadge({
  children,
  title,
}: {
  /** The number (or a placeholder like „—“). */
  children: React.ReactNode;
  /** Tooltip, e.g. what the number means or to spell out a placeholder. */
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-block w-9 shrink-0 rounded-[4px] border border-line bg-surface-2 px-1 py-px text-right text-micro tabular-nums text-ink-faint"
    >
      {children}
    </span>
  );
}
