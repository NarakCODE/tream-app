import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface SettingCardProps {
  title?: string
  description?: ReactNode
  icon?: React.ComponentType<{ className?: string }>
  children?: ReactNode
  highlighted?: boolean
  onClick?: () => void
  className?: string
}

export function SettingCard({
  title,
  description,
  icon: Icon,
  children,
  highlighted,
  onClick,
  className,
}: SettingCardProps) {
  const Comp = onClick ? "button" : "div"

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-4 text-left transition shadow-xs",
        onClick && "cursor-pointer",
        highlighted
          ? "border-primary/40 bg-primary/5 text-foreground"
          : "border-border bg-card/70 text-foreground",
        onClick && !highlighted && "hover:border-primary/40 hover:bg-primary/5",
        className
      )}
    >
      {(Icon || title) && (
        <div className="flex items-center gap-3">
          {Icon && (
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl",
                highlighted
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
          )}
          {title && <p className="text-sm font-semibold">{title}</p>}
        </div>
      )}
      {description && (
        <div className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </div>
      )}
      {children}
    </Comp>
  )
}
