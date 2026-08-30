"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import { WorkspaceSwitcher } from "./workspace-switcher"
import { SidebarSearch } from "./sidebar-search"
import { SidebarNav } from "./sidebar-nav"
import { ActiveProjects } from "./active-projects"
import { SidebarFooterNav } from "./sidebar-footer-nav"
import { UserMenu } from "./user-menu"

export function AppSidebar() {
  return (
    <Sidebar className="border-border/40 border-r-0 shadow-none border-none">
      <SidebarHeader className="p-4">
        <WorkspaceSwitcher />
      </SidebarHeader>

      <SidebarContent className="gap-0 px-0">
        <SidebarSearch />
        <SidebarNav />
        <ActiveProjects />
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 p-2">
        <SidebarFooterNav />
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  )
}
