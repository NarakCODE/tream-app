"use client"

import Image from "next/image"
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
        <Button
          variant="ghost"
          className={cn(
            "h-auto w-full justify-between px-2 py-2 text-left font-normal hover:bg-accent",
            className
          )}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-blue-800 text-primary-foreground shadow-[inset_0_-5px_6.6px_0_rgba(0,0,0,0.25)]">
              {currentWorkspace.logo ? (
                <Image
                  src={currentWorkspace.logo}
                  alt={currentWorkspace.name}
                  width={16}
                  height={16}
                  className="object-contain"
                />
              ) : (
                <span className="text-xs font-semibold">
                  {currentWorkspace.name.charAt(0)}
                </span>
              )}
            </div>

            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold leading-none">
                {currentWorkspace.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {currentWorkspace.plan}
              </span>
            </div>
          </div>

          <SortV className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] w-full"
        align="start"
        sideOffset={4}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Workspaces
        </DropdownMenuLabel>

        <DropdownMenuGroup>
          {workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              className="gap-3"
              onSelect={() => onWorkspaceChange?.(workspace.id)}
            >
              <div className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-blue-800 text-primary-foreground">
                {workspace.logo ? (
                  <Image
                    src={workspace.logo}
                    alt={workspace.name}
                    width={14}
                    height={14}
                    className="object-contain"
                  />
                ) : (
                  <span className="text-[10px] font-semibold">
                    {workspace.name.charAt(0)}
                  </span>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm leading-none">
                  {workspace.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {workspace.plan}
                </span>
              </div>

              {workspace.id === currentWorkspaceId && (
                <Check className="ml-auto h-4 w-4 shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => onCreateWorkspace?.()}>
          <Plus />
          Create workspace
        </DropdownMenuItem>

        <DropdownMenuItem>
          <Settings />
          Workspace settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}