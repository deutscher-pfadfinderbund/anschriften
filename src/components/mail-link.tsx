import { cn } from "@/lib/utils";

/**
 * A mailto link in ink, underlined on hover, so a column of addresses stays quiet.
 * A long address wraps, first before the "@", instead of being cut off: touch screens
 * have no tooltip to reveal the rest.
 */
export function MailLink({ email, className }: { email: string; className?: string }) {
  const at = email.lastIndexOf("@");
  return (
    <a
      // A stored address like "a@b.de?bcc=x@y.de" must not add headers; umlauts stay readable.
      href={`mailto:${email.replace(/[?&#%]/g, encodeURIComponent)}`}
      className={cn(
        "rounded-sm text-ink underline-offset-2 transition-colors wrap-anywhere hover:underline",
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
