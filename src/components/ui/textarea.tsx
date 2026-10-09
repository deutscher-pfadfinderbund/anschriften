import * as React from "react"

import { FIELD, cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(FIELD, "flex field-sizing-content h-auto min-h-16 py-2", className)}
      {...props}
    />
  )
}

export { Textarea }
