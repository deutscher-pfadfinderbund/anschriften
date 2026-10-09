import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Comfortable touch target wherever the primary pointer is a finger. Keyed on the
 * input mode (`@media (pointer: coarse)`), not on viewport width: a 768px tablet is
 * still touch-operated, while a mouse-driven window keeps the dense sizes at every
 * width.
 */
const TOUCH_TARGET = "pointer-coarse:min-h-11 pointer-coarse:min-w-11"

// Focus: no ring classes here on purpose — buttons use the app-wide solid
// :focus-visible outline from globals.css (2px fir, 2px offset), which stays
// visible on a fir fill too.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-body font-medium whitespace-nowrap transition-colors select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-fir-deep",
        outline:
          "border-line-strong bg-surface text-ink hover:bg-hover aria-expanded:bg-active",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-hover aria-expanded:bg-active",
        ghost: "hover:bg-hover hover:text-ink aria-expanded:bg-active aria-expanded:text-ink",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/15",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-caption has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        // Icon-only buttons are 24–32px — fine for a mouse, too small for a
        // finger. `pointer-coarse:` grows the hit area to ~44px on touch devices
        // only; the icon glyph itself never changes and a mouse keeps the dense
        // sizes at every viewport width.
        icon: `size-8 ${TOUCH_TARGET}`,
        "icon-xs": `size-6 rounded-[min(var(--radius-md),10px)] [&_svg:not([class*='size-'])]:size-3 ${TOUCH_TARGET}`,
        "icon-sm": `size-7 rounded-[min(var(--radius-md),12px)] ${TOUCH_TARGET}`,
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
