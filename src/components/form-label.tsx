import { cn } from "@/lib/utils";

/** Caption above a form field: the app-wide `eyebrow` label recipe. */
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
    <label htmlFor={htmlFor} className={cn("eyebrow mb-1.5 block", className)}>
      {children}
    </label>
  );
}
