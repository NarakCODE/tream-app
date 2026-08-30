"use client"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
} from "@/components/ui/sidebar"
import { ActiveProjectItem } from "./active-project-item"
import { activeProjects, type ActiveProject } from "@/lib/data/sidebar"

interface ActiveProjectsProps {
  projects?: ActiveProject[]
  onProjectAction?: (project: ActiveProject) => void
}

export function ActiveProjects({
  projects = activeProjects,
  onProjectAction,
}: ActiveProjectsProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="px-3 text-xs font-medium text-muted-foreground">
        Active Projects
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {projects.map((project) => (
            <ActiveProjectItem
              key={project.name}
              project={project}
              onActionClick={onProjectAction}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
