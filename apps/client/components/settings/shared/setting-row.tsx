import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface SettingRowProps {
  label: string
  description?: string
  children: ReactNode
  className?: string
}

export function SettingRow({
  label,
  description,
  children,
  className,
}: SettingRowProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-10 sm:grid sm:grid-cols-[minmax(0,250px)_minmax(0,1fr)] sm:items-center sm:gap-6",
        className
      )}
    >
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2 text-sm text-foreground">{children}</div>
    </div>
  )
}
