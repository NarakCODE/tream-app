"use client"

import type { ReactNode } from "react"
import { format, isValid } from "date-fns"
import { CalendarBlank, Flag } from "@phosphor-icons/react/dist/ssr"
import { cn } from "@/lib/utils"

export type DueDateVariant = "board" | "list" | "short" | "full"

export type DueDateProps = {
  date?: Date | string | number | null
  variant?: DueDateVariant
  dateFormat?: string
  fallbackText?: string
  icon?: ReactNode | "calendar" | "flag" | "none"
  className?: string
  iconClassName?: string
  textClassName?: string
}

function parseDueDate(date?: Date | string | number | null): Date | null {
  if (!date) return null
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date
  const parsed = new Date(date)
  return isValid(parsed) ? parsed : null
}

export function DueDate({
  date,
  variant = "list",
  dateFormat,
  fallbackText,
  icon,
  className,
  iconClassName,
  textClassName,
}: DueDateProps) {
  const parsedDate = parseDueDate(date)
  const isBoardStyle = variant === "board" || variant === "short"

  const defaultFormat = isBoardStyle ? "MMM d" : "MMM d, yyyy"
  const defaultFallback = isBoardStyle ? "No due date" : "—"

  const formattedText = parsedDate
    ? format(parsedDate, dateFormat ?? defaultFormat)
    : (fallbackText ?? defaultFallback)

  const defaultIconClass = isBoardStyle ? "h-4 w-4" : "h-4 w-4"
  const resolvedIconClass = cn(defaultIconClass, iconClassName)

  const renderIcon = () => {
    if (icon === "none") return null
    if (icon === "calendar") return <CalendarBlank className={resolvedIconClass} />
    if (icon === "flag") return <Flag className={resolvedIconClass} />
    if (icon) return icon

    return isBoardStyle ? (
      <Flag className={resolvedIconClass} />
    ) : (
      <CalendarBlank className={resolvedIconClass} />
    )
  }

  const containerClass = isBoardStyle
    ? "flex items-center gap-1.5 text-xs text-muted-foreground"
    : "flex items-center gap-2 text-sm text-muted-foreground"

  return (
    <div className={cn(containerClass, className)}>
      {renderIcon()}
      <span className={textClassName}>{formattedText}</span>
    </div>
  )
}
