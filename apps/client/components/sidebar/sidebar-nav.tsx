"use client"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from "@/components/ui/sidebar"
import { SidebarNavItem } from "./sidebar-nav-item"
import { navItems, type NavItem } from "@/lib/data/sidebar"

interface SidebarNavProps {
  items?: NavItem[]
}

export function SidebarNav({ items = navItems }: SidebarNavProps) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarNavItem key={item.id} item={item} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
