"use client"

import { DialogDescription, DialogTitle } from "@/components/ui/dialog"

export function PlaceholderSettingsPane() {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-2">
      <DialogTitle className="text-xl">Settings preview</DialogTitle>
      <DialogDescription>
        This area is reserved for additional settings pages in the full product.
      </DialogDescription>
    </div>
  )
}
