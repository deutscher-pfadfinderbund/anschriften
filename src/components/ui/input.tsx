import * as React from "react"

import { FIELD, cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(FIELD, "py-1", className)}
      {...props}
    />
  )
}

export { Input }
