"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
} from "@/components/ui/sidebar"
import { navItemIcons } from "./icons"
import type { NavItem, NavItemId } from "@/lib/data/sidebar"

interface SidebarNavItemProps {
  item: NavItem
}

export function getHrefForNavItem(id: NavItemId): string {
  if (id === "my-tasks") return "/tasks"
  if (id === "projects") return "/"
  if (id === "inbox") return "/inbox"
  if (id === "clients") return "/clients"
  if (id === "performance") return "/performance"
  return "#"
}

export function isNavItemActive(id: NavItemId, pathname: string): boolean {
  if (id === "projects") {
    return pathname === "/" || pathname.startsWith("/projects")
  }
  if (id === "my-tasks") {
    return pathname.startsWith("/tasks")
  }
  if (id === "inbox") {
    return pathname.startsWith("/inbox")
  }
  if (id === "clients") {
    return pathname.startsWith("/clients")
  }
  if (id === "performance") {
    return pathname.startsWith("/performance")
  }
  return false
}

export function SidebarNavItem({ item }: SidebarNavItemProps) {
  const pathname = usePathname()
  const href = getHrefForNavItem(item.id)
  const active = isNavItemActive(item.id, pathname)
  const Icon = navItemIcons[item.id]

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        className="h-9 rounded-lg px-3 font-normal text-muted-foreground"
      >
        <Link href={href}>
          {Icon ? <Icon className="h-[18px] w-[18px]" /> : null}
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {item.badge && (
        <SidebarMenuBadge className="bg-muted text-muted-foreground rounded-full px-2">
          {item.badge}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  )
}
