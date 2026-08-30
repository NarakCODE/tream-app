"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Check, SortV, Plus, Settings } from "reicon-react"
import { getGlassAvatarUrl } from "@/lib/dicebear"
import { cn } from "@/lib/utils"

export interface Workspace {
  id: string
  name: string
  plan: string
  logo?: string
}

export interface WorkspaceSwitcherProps {
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
    logo: getGlassAvatarUrl("Workspace"),
  },
  {
    id: "2",
    name: "Acme Inc",
    plan: "Free plan",
    logo: getGlassAvatarUrl("Acme Inc"),
  },
  {
    id: "3",
    name: "Design Team",
    plan: "Team plan",
    logo: getGlassAvatarUrl("Design Team"),
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

  const currentLogo =
    currentWorkspace.logo || getGlassAvatarUrl(currentWorkspace.name)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-auto w-full justify-between px-2 py-2 text-left font-normal hover:bg-accent",
            className
          )}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/40 shadow-xs">
              <img
                src={currentLogo}
                alt={currentWorkspace.name}
                className="h-full w-full object-cover"
              />
            </div>

            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold leading-none">
                {currentWorkspace.name}
              </span>
              <span className="truncate text-xs text-muted-foreground mt-1">
                {currentWorkspace.plan}
              </span>
            </div>
          </div>

          <SortV className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
        align="start"
        sideOffset={4}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Workspaces
        </DropdownMenuLabel>

        <DropdownMenuGroup>
          {workspaces.map((workspace) => {
            const logo =
              workspace.logo || getGlassAvatarUrl(workspace.name)

            return (
              <DropdownMenuItem
                key={workspace.id}
                className="gap-3 cursor-pointer"
                onSelect={() => onWorkspaceChange?.(workspace.id)}
              >
                <div className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/40 shadow-xs">
                  <img
                    src={logo}
                    alt={workspace.name}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm leading-none">
                    {workspace.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground mt-0.5">
                    {workspace.plan}
                  </span>
                </div>

                {workspace.id === currentWorkspaceId && (
                  <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />
                )}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>

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