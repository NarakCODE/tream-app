import {
  Inbox,
  CheckSquare,
  Folder,
  Users,
  ChartBar,
  Settings,
  Layout,
  HelpCircle,
} from "reicon-react"
import type { NavItemId, SidebarFooterItemId } from "@/lib/data/sidebar"

export const navItemIcons: Record<NavItemId, React.ComponentType<{ className?: string }>> = {
  inbox: Inbox,
  "my-tasks": CheckSquare,
  projects: Folder,
  clients: Users,
  performance: ChartBar,
}

export const footerItemIcons: Record<SidebarFooterItemId, React.ComponentType<{ className?: string }>> = {
  settings: Settings,
  templates: Layout,
  help: HelpCircle,
}
