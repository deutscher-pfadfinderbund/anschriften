"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { CheckIcon, MinusIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// Boundary in --control (≥ 3:1, like every form field); focus uses the global
// :focus-visible outline. The ::after band widens the hit area for fingers.
// Checked and indeterminate ("some selected") boxes are filled; the latter shows a
// dash. Hover and invalid borders apply to the unchecked box only.
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-control bg-field transition-colors after:absolute after:-inset-x-3 after:-inset-y-2 hover:data-[state=unchecked]:border-ink-soft disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:data-[state=unchecked]:border-crit data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="group/indicator grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon className="group-data-[state=indeterminate]/indicator:hidden" />
        <MinusIcon className="hidden group-data-[state=indeterminate]/indicator:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
