"use client"

import { useState } from "react"
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { footerItemIcons } from "./icons"
import { footerItems, type SidebarFooterItem } from "@/lib/data/sidebar"
import { SettingsDialog } from "@/components/settings/settings-dialog"

interface SidebarFooterNavProps {
  items?: SidebarFooterItem[]
}

export function SidebarFooterNav({ items = footerItems }: SidebarFooterNavProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  return (
    <>
      <SidebarMenu>
        {items.map((item) => {
          const Icon = footerItemIcons[item.id]

          return (
            <SidebarMenuItem key={item.label}>
              <SidebarMenuButton
                className="h-9 rounded-lg px-3 text-muted-foreground"
                onClick={() => {
                  if (item.id === "settings") {
                    setIsSettingsOpen(true)
                  }
                }}
              >
                {Icon ? <Icon className="h-[18px] w-[18px]" /> : null}
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>

      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </>
  )
}
