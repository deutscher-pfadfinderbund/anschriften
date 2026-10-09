"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

/** `open` of a controlled <Dialog>, for its panel; undefined when uncontrolled. */
const DialogOpenContext = React.createContext<boolean | undefined>(undefined)

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return (
    <DialogOpenContext value={props.open}>
      <DialogPrimitive.Root data-slot="dialog" {...props} />
    </DialogOpenContext>
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-scrim duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * Radix only returns focus to a <DialogTrigger>, but almost every dialog here is
 * opened from state. So the panel remembers what had focus when it opened and
 * goes back there on close. If that element is gone (e.g. the deleted row) or
 * never had focus (Safari does not focus a clicked button), Radix's own handler
 * gets its turn and focuses the <DialogTrigger>, if there is one; failing both,
 * focus lands on the page's main landmark (#inhalt).
 */
function focusOpener(opener: Element | null): boolean {
  if (!(opener instanceof HTMLElement) || opener === document.body || !opener.isConnected) {
    return false
  }
  opener.focus()
  return document.activeElement === opener
}

function DialogPanel({
  className,
  children,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  // Mounted fresh on every open (the portal's Presence unmounts it when
  // closed), and captured during render — before an `autoFocus` field inside
  // the dialog has moved focus away from the opener.
  const [opener] = React.useState(() =>
    typeof document === "undefined" ? null : document.activeElement
  )
  // While it fades out, the panel shows what it showed while open: callers may derive
  // `open` and the content from one state, which empties the moment closing starts.
  const open = React.useContext(DialogOpenContext)
  const [shown, setShown] = React.useState(children)
  if (open && shown !== children) setShown(children)

  return (
    <DialogPrimitive.Content
      data-slot="dialog-content"
      onCloseAutoFocus={(event) => {
        onCloseAutoFocus?.(event)
        if (event.defaultPrevented) return
        if (focusOpener(opener)) {
          event.preventDefault() // skip Radix's trigger focus
          return
        }
        // Not prevented, so Radix's handler runs next and focuses the trigger,
        // if any. The microtask runs after it: only if nothing took focus.
        queueMicrotask(() => {
          if (document.activeElement === document.body) {
            document.getElementById("inhalt")?.focus()
          }
        })
      }}
      className={cn(
        // Sized against the viewport (dvw/dvh), not `100%`: a fixed element's
        // percentage resolves against the initial containing block, which the
        // browser widens to the document's overflow width — so on a page that
        // scrolls sideways the dialog grew with it and got clipped on both
        // edges. max-h keeps a tall dialog's buttons reachable on a phone.
        "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100dvw-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl bg-popover p-4 text-body text-popover-foreground shadow-lg ring-1 ring-line-strong duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      {...props}
    >
      {open === false ? shown : children}
      <DialogPrimitive.Close data-slot="dialog-close" asChild>
        {/* The icon sizes grow to a 44px tap target on touch devices; pulling
            the anchor into the corner keeps the glyph optically where it sits
            with a mouse (8px + half of 28px === 0px + half of 44px). Same
            `pointer-coarse` key as TOUCH_TARGET in button.tsx. */}
        <Button
          variant="ghost"
          className="absolute top-2 right-2 text-ink-faint pointer-coarse:top-0 pointer-coarse:right-0"
          size="icon-sm"
        >
          <XIcon />
          <span className="sr-only">Schließen</span>
        </Button>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  )
}

/** Overlay plus panel. DialogPanel is its own component so it mounts fresh per opening. */
function DialogContent(props: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPanel {...props} />
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t border-line bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "pr-6 font-display text-panel font-semibold text-ink",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-ui text-ink-soft *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-ink",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
}
