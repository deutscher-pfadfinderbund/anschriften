"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

/*
 * Deviation from the shadcn default on purpose: the app has exactly one language
 * for "active/selected" — neutral surface plus a fir marker and fir-tinted text
 * (see the sidebar nav and the Verteiler rail). The stock raised white box with a
 * shadow would be a second idiom, so the list stays transparent and the marker
 * lives on the trigger.
 */
function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-8 w-fit items-center justify-center gap-1 bg-transparent text-ink-soft",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-ui font-medium whitespace-nowrap text-ink-soft transition-colors",
        "hover:text-ink",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:text-fir",
        // Fir marker: an underline on the active tab.
        "after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full after:bg-fir after:opacity-0 after:transition-opacity",
        "data-[state=active]:after:opacity-100",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

/**
 * Not a Tab stop of its own (Radix makes it one): every panel here holds focusable
 * rows, and an outline-less stop would read as lost focus.
 */
function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      tabIndex={-1}
      className={cn("flex-1 text-body outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
