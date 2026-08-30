"use client"

import { SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar"
import { ProgressCircle } from "@/components/progress-circle"
import type { ActiveProject } from "@/lib/data/sidebar"

interface ActiveProjectItemProps {
  project: ActiveProject
  onActionClick?: (project: ActiveProject) => void
}

export function ActiveProjectItem({
  project,
  onActionClick,
}: ActiveProjectItemProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton className="h-9 rounded-lg px-3 group">
        <ProgressCircle
          progress={project.progress}
          color={project.color}
          size={18}
        />
        <span className="flex-1 truncate text-sm">{project.name}</span>
        <span
          className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-accent cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            onActionClick?.(project)
          }}
        >
          <span className="text-muted-foreground text-lg">···</span>
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
