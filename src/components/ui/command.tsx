"use client"

import * as React from "react"
import { Command as CommandPrimitive, useCommandState } from "cmdk"
import { SearchIcon, CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Command({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground",
        className
      )}
      {...props}
    >
      {children}
      <MatchCount />
    </CommandPrimitive>
  )
}

/** Tells screen readers how many options match while a search is typed. */
function MatchCount() {
  const text = useCommandState((s) =>
    s.search ? (s.filtered.count === 0 ? "Keine Treffer" : `${s.filtered.count} Treffer`) : ""
  )
  return (
    <p role="status" className="sr-only">
      {text}
    </p>
  )
}

/** Search field of a picker: the same bordered field as Input, with a lens. */
function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="p-1 pb-0">
      <div className="flex h-8 items-center gap-2 rounded-lg border border-control bg-field px-2.5 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
        <SearchIcon aria-hidden className="size-4 shrink-0 text-ink-faint" />
        <CommandPrimitive.Input
          data-slot="command-input"
          className={cn(
            "h-full w-full min-w-0 bg-transparent text-base text-ink outline-hidden placeholder:text-ink-faint disabled:cursor-not-allowed disabled:opacity-50 md:text-body",
            className
          )}
          {...props}
        />
      </div>
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto pt-1 outline-none",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-6 text-center text-ui text-ink-faint", className)}
      {...props}
    />
  )
}

/**
 * A row; pass `data-checked` for the chosen value: a trailing checkmark, and the state
 * spelled out for screen readers (cmdk's aria-selected follows the keyboard cursor).
 */
function CommandItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item> & { "data-checked"?: boolean }) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "group/command-item relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-body outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-hover data-selected:text-ink [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      {props["data-checked"] ? <span className="sr-only">, ausgewählt</span> : null}
      <CheckIcon
        aria-hidden
        className="ml-auto text-fir opacity-0 group-data-[checked=true]/command-item:opacity-100"
      />
    </CommandPrimitive.Item>
  )
}

export { Command, CommandInput, CommandList, CommandEmpty, CommandItem }
