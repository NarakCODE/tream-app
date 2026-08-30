"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getAvatarUrl } from "@/lib/assets/avatars"
import { User } from "@phosphor-icons/react/dist/ssr"
import { cn } from "@/lib/utils"

export type ProjectAssigneeProps = {
  assignee?: string
  avatarUrl?: string
  className?: string
  fallbackClassName?: string
  iconClassName?: string
  alt?: string
}

export function getAssigneeInitials(name?: string): string | null {
  if (!name) return null
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function ProjectAssignee({
  assignee,
  avatarUrl,
  className,
  fallbackClassName,
  iconClassName,
  alt,
}: ProjectAssigneeProps) {
  const resolvedAvatarUrl = avatarUrl ?? getAvatarUrl(assignee)
  const initials = getAssigneeInitials(assignee)

  return (
    <Avatar className={cn("size-6 border border-border", className)}>
      <AvatarImage alt={alt ?? assignee ?? ""} src={resolvedAvatarUrl} />
      <AvatarFallback className={cn("text-xs", fallbackClassName)}>
        {initials ? (
          initials
        ) : (
          <User className={cn("h-4 w-4 text-muted-foreground", iconClassName)} />
        )}
      </AvatarFallback>
    </Avatar>
  )
}
