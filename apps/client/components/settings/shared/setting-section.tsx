import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface SettingSectionProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export function SettingSection({
  title,
  description,
  children,
  className,
}: SettingSectionProps) {
  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  )
}
