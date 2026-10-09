import { cn } from "@/lib/utils";

/**
 * A mailto link in ink, fir only on hover, so a column of addresses is no green stripe.
 * A long address wraps, first before the "@", instead of being cut off: touch screens
 * have no tooltip to reveal the rest.
 */
export function MailLink({ email, className }: { email: string; className?: string }) {
  const at = email.lastIndexOf("@");
  return (
    <a
      href={`mailto:${email}`}
      className={cn(
        "rounded-sm text-ink underline-offset-2 transition-colors wrap-anywhere hover:text-fir hover:underline",
        className,
      )}
    >
      {at > 0 ? (
        <>
          {email.slice(0, at)}
          <wbr />
          {email.slice(at)}
        </>
      ) : (
        email
      )}
    </a>
  );
}
