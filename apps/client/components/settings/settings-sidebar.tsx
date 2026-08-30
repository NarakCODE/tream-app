"use client"

import { SettingsNavItem } from "./settings-nav-item"
import {
  settingsSections,
  type SettingsItemId,
} from "./settings-types"

interface SettingsSidebarProps {
  activeItemId: SettingsItemId
  onSelectItemId: (id: SettingsItemId) => void
}

export function SettingsSidebar({
  activeItemId,
  onSelectItemId,
}: SettingsSidebarProps) {
  return (
    <aside className="w-full border-b border-border/60 bg-muted/40 px-4 py-4 sm:w-64 sm:border-b-0 sm:border-r">
      <div className="space-y-4 text-sm">
        {settingsSections.map((section) => (
          <div key={section.id} className="space-y-1.5">
            <div className="text-sm font-semibold text-muted-foreground px-2">
              {section.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <SettingsNavItem
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  isActive={item.id === activeItemId}
                  onClick={() => onSelectItemId(item.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
