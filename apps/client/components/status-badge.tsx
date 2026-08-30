"use client"

import type { Project } from "@/lib/data/projects"
import { cn } from "@/lib/utils"

export type ProjectStatus = Project["status"]

export type ProjectStatusConfig = {
  label: string
  dot: string
  pill: string
}

export function statusConfig(status: ProjectStatus | string): ProjectStatusConfig {
  switch (status) {
    case "active":
      return {
        label: "Active",
        dot: "bg-teal-600 dark:bg-teal-400",
        pill: "text-teal-700 border-teal-200 bg-teal-50 dark:text-teal-100 dark:border-teal-500/40 dark:bg-teal-500/10",
      }
    case "planned":
      return {
        label: "Planned",
        dot: "bg-zinc-900 dark:bg-zinc-200",
        pill: "text-zinc-900 border-zinc-200 bg-zinc-50 dark:text-zinc-50 dark:border-zinc-600/60 dark:bg-zinc-600/20",
      }
    case "backlog":
      return {
        label: "Backlog",
        dot: "bg-orange-600 dark:bg-orange-400",
        pill: "text-orange-700 border-orange-200 bg-orange-50 dark:text-orange-100 dark:border-orange-500/40 dark:bg-orange-500/10",
      }
    case "completed":
      return {
        label: "Completed",
        dot: "bg-blue-600 dark:bg-blue-400",
        pill: "text-blue-700 border-blue-200 bg-blue-50 dark:text-blue-100 dark:border-blue-500/40 dark:bg-blue-500/10",
      }
    case "cancelled":
      return {
        label: "Cancelled",
        dot: "bg-rose-600 dark:bg-rose-400",
        pill: "text-rose-700 border-rose-200 bg-rose-50 dark:text-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10",
      }
    default:
      return {
        label: status,
        dot: "bg-zinc-400 dark:bg-zinc-300",
        pill: "text-zinc-700 border-zinc-200 bg-zinc-50 dark:text-zinc-100 dark:border-zinc-600/60 dark:bg-zinc-600/20",
      }
  }
}

export type StatusBadgeProps = {
  status: ProjectStatus | string
  className?: string
  showDot?: boolean
  label?: string
}

export function StatusBadge({ status, className, showDot = true, label }: StatusBadgeProps) {
  const s = statusConfig(status)

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        s.pill,
        className,
      )}
    >
      {showDot && <span className={cn("inline-block size-1.5 rounded-full", s.dot)} />}
      {label ?? s.label}
    </div>
  )
}
