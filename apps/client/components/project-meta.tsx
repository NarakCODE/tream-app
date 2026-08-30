"use client"

import type { Project } from "@/lib/data/projects"
import { cn } from "@/lib/utils"

export type ProjectMetaSource = Partial<
  Pick<Project, "client" | "typeLabel" | "durationLabel" | "tags">
>

export type ProjectMetaProps = {
  project?: ProjectMetaSource
  client?: string
  typeLabel?: string
  durationLabel?: string
  tags?: string[]
  className?: string
  as?: "p" | "div" | "span"
}

export function formatProjectMeta(source: {
  client?: string
  typeLabel?: string
  durationLabel?: string
  tags?: string[]
}): string {
  const a = source.client
  const b = source.typeLabel
  const c = source.durationLabel
  if (a || b || c) {
    return [a, b, c].filter(Boolean).join(" • ")
  }
  if (source.tags && source.tags.length > 0) {
    return source.tags.join(" • ")
  }
  return ""
}

export function ProjectMeta({
  project,
  client,
  typeLabel,
  durationLabel,
  tags,
  className,
  as: Component = "p",
}: ProjectMetaProps) {
  const resolvedClient = client ?? project?.client
  const resolvedTypeLabel = typeLabel ?? project?.typeLabel
  const resolvedDurationLabel = durationLabel ?? project?.durationLabel
  const resolvedTags = tags ?? project?.tags

  const text = formatProjectMeta({
    client: resolvedClient,
    typeLabel: resolvedTypeLabel,
    durationLabel: resolvedDurationLabel,
    tags: resolvedTags,
  })

  if (!text) return null

  return (
    <Component className={cn("text-sm text-muted-foreground truncate", className)}>
      {text}
    </Component>
  )
}
