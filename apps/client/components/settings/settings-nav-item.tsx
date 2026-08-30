"use client"

import { cn } from "@/lib/utils"
import {
  settingsItemIcons,
  type SettingsItemId,
} from "./settings-types"

interface SettingsNavItemProps {
  id: SettingsItemId
  label: string
  isActive: boolean
  onClick: () => void
}

export function SettingsNavItem({
  id,
  label,
  isActive,
  onClick,
}: SettingsNavItemProps) {
  const Icon = settingsItemIcons[id]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-left text-[15px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        isActive && "bg-accent text-foreground font-medium"
      )}
    >
      <span className="flex items-center gap-2.5">
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        <span>{label}</span>
      </span>
    </button>
  )
}
