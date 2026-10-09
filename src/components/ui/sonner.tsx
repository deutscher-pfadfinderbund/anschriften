"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Colors come from the design tokens (which follow the OS theme and the
// data-theme override); the inline style beats Sonner's own system-ui font.
// Buttons, description and close button are restyled in globals.css ("Toasts").
//
// Top center, below the mobile top bar (--top-bar): at the bottom a toast would
// cover the sticky bars (directory selection, Speichern), at the top right the
// page header's actions.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      position="top-center"
      offset={{ top: "calc(var(--top-bar) + 16px)" }}
      mobileOffset={{ top: "calc(var(--top-bar) + 8px)" }}
      containerAriaLabel="Benachrichtigungen"
      icons={{
        success: <CircleCheckIcon className="size-4 text-fir" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4 text-brass" />,
        error: <OctagonXIcon className="size-4 text-crit" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          fontFamily: "var(--font-sans)",
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--line-strong)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
