import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Uppercase caption above a form field — the shared style used across all editors. */
export function FormLabel({
  htmlFor,
  className,
  children,
}: {
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className={cn(
        "mb-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-faint",
        className,
      )}
    >
      {children}
    </Label>
  );
}
