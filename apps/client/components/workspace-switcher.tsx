"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SortV, Check, Plus, Settings } from "reicon-react"
import { cn } from "@/lib/utils"

interface Workspace {
  id: string
  name: string
  plan: string
  logo?: string
}

interface WorkspaceSwitcherProps {
  workspaces?: Workspace[]
  currentWorkspaceId?: string
  onWorkspaceChange?: (workspaceId: string) => void
  onCreateWorkspace?: () => void
  className?: string
}

const defaultWorkspaces: Workspace[] = [
  {
    id: "1",
    name: "Workspace",
    plan: "Pro plan",
    logo: "/logo-wrapper.png",
  },
  {
    id: "2",
    name: "Acme Inc",
    plan: "Free plan",
  },
  {
    id: "3",
    name: "Design Team",
    plan: "Team plan",
  },
]

export function WorkspaceSwitcher({
  workspaces = defaultWorkspaces,
  currentWorkspaceId = "1",
  onWorkspaceChange,
  onCreateWorkspace,
  className,
}: WorkspaceSwitcherProps) {
  const currentWorkspace =
    workspaces.find((w) => w.id === currentWorkspaceId) ?? workspaces[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center justify-between rounded-lg p-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-800 text-primary-foreground shadow-[inset_0_-5px_6.6px_0_rgba(0,0,0,0.25)]">
              {currentWorkspace.logo ? (
                <img
                  src={currentWorkspace.logo}
                  alt={currentWorkspace.name}
                  className="h-4 w-4"
                />
              ) : (
                <span className="text-xs font-semibold">
                  {currentWorkspace.name.charAt(0)}
                </span>
              )}
            </div>

            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">
                {currentWorkspace.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {currentWorkspace.plan}
              </span>
            </div>
          </div>

          <SortV className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
        align="start"
        sideOffset={8}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Workspaces
        </DropdownMenuLabel>

        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            className="cursor-pointer gap-3"
            onSelect={() => onWorkspaceChange?.(workspace.id)}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-800 text-primary-foreground">
              {workspace.logo ? (
                <img
                  src={workspace.logo}
                  alt={workspace.name}
                  className="h-3.5 w-3.5"
                />
              ) : (
                <span className="text-[10px] font-semibold">
                  {workspace.name.charAt(0)}
                </span>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{workspace.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {workspace.plan}
              </span>
            </div>

            {workspace.id === currentWorkspaceId && (
              <Check className="h-4 w-4 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="cursor-pointer gap-2"
          onSelect={() => onCreateWorkspace?.()}
        >
          <Plus className="h-4 w-4" />
          <span>Create workspace</span>
        </DropdownMenuItem>

        <DropdownMenuItem className="cursor-pointer gap-2">
          <Settings className="h-4 w-4" />
          <span>Workspace settings</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}