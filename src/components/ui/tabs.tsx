"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
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
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center gap-1 bg-transparent text-ink-soft group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:items-stretch",
  {
    variants: {
      variant: {
        default: "",
        line: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
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
        "relative inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-[13.5px] font-medium whitespace-nowrap text-ink-soft transition-colors",
        "group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start",
        "outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:text-fir",
        // Fir marker: underline when horizontal, left bar when vertical.
        "after:absolute after:bg-fir after:opacity-0 after:transition-opacity",
        "group-data-horizontal/tabs:after:inset-x-1 group-data-horizontal/tabs:after:-bottom-px group-data-horizontal/tabs:after:h-0.5 group-data-horizontal/tabs:after:rounded-full",
        "group-data-vertical/tabs:after:inset-y-0.5 group-data-vertical/tabs:after:-left-1 group-data-vertical/tabs:after:w-0.5 group-data-vertical/tabs:after:rounded-full",
        "data-[state=active]:after:opacity-100",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
