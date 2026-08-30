"use client"

import type { ReactNode } from "react"
import { useRef } from "react"
import { useRouter } from "next/navigation"
import { Folder } from "@phosphor-icons/react/dist/ssr"
import type { Project } from "@/lib/data/projects"
import { cn } from "@/lib/utils"
import { PriorityBadge } from "@/components/priority-badge"
import { ProjectProgress } from "@/components/project-progress"
import { StatusBadge, statusConfig } from "@/components/status-badge"
import { ProjectMeta } from "@/components/project-meta"
import { DueDate } from "@/components/due-date"
import { ProjectAssignee } from "@/components/project-assignee"

export { StatusBadge, statusConfig } from "@/components/status-badge"
export { ProjectMeta } from "@/components/project-meta"
export { DueDate } from "@/components/due-date"
export { ProjectAssignee } from "@/components/project-assignee"

export type ProjectCardVariant = "list" | "board"

export type ProjectCardProps = {
  project: Project
  actions?: ReactNode
  variant?: ProjectCardVariant
  className?: string
  children?: ReactNode
  onClick?: () => void
}

export type ProjectCardHeaderProps = {
  project: Project
  variant?: ProjectCardVariant
  actions?: ReactNode
  className?: string
}

export function ProjectCardHeader({
  project,
  variant = "list",
  actions,
  className,
}: ProjectCardHeaderProps) {
  const isBoard = variant === "board"

  return (
    <div className={cn("flex items-center justify-between", className)}>
      {isBoard ? (
        <DueDate date={project.endDate} variant="board" />
      ) : (
        <div className="text-muted-foreground">
          <Folder className="h-5 w-5" />
        </div>
      )}
      <div className="flex items-center gap-2">
        {!isBoard && <StatusBadge status={project.status} />}
        {isBoard && <PriorityBadge level={project.priority} appearance="inline" />}
        {actions ? (
          <div
            className="shrink-0"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export type ProjectTitleProps = {
  project: Project
  variant?: ProjectCardVariant
  className?: string
}

export function ProjectTitle({
  project,
  variant = "list",
  className,
}: ProjectTitleProps) {
  const isBoard = variant === "board"

  return (
    <div className={cn("mt-3", className)}>
      <p className="text-[15px] font-semibold text-foreground leading-6">
        {project.name}
      </p>
      <ProjectMeta
        project={project}
        as={isBoard ? "div" : "p"}
        className="mt-1"
      />
    </div>
  )
}

export type ProjectMetaRowProps = {
  project: Project
  className?: string
}

export function ProjectMetaRow({ project, className }: ProjectMetaRowProps) {
  return (
    <div
      className={cn(
        "mt-2 flex items-center justify-between text-sm text-muted-foreground",
        className,
      )}
    >
      <DueDate date={project.endDate} variant="list" />
      <PriorityBadge level={project.priority} appearance="inline" />
    </div>
  )
}

export type ProjectCardFooterProps = {
  project: Project
  variant?: ProjectCardVariant
  className?: string
}

export function ProjectCardFooter({
  project,
  variant = "list",
  className,
}: ProjectCardFooterProps) {
  const isBoard = variant === "board"
  const assignee = project.members?.[0]

  return (
    <div className={cn("mt-3 flex items-center justify-between", className)}>
      <ProjectProgress project={project} size={isBoard ? 20 : 18} />
      <ProjectAssignee assignee={assignee} />
    </div>
  )
}

export function ProjectCard({
  project,
  actions,
  variant = "list",
  className,
  children,
  onClick,
}: ProjectCardProps) {
  const isBoard = variant === "board"
  const router = useRouter()
  const draggingRef = useRef(false)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)

  const goToDetails = () => {
    if (onClick) {
      onClick()
    } else {
      router.push(`/projects/${project.id}`)
    }
  }

  const onKeyNavigate: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      goToDetails()
    }
  }

  const onMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!isBoard) return
    startPosRef.current = { x: e.clientX, y: e.clientY }
    draggingRef.current = false
  }

  const onMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!isBoard || !startPosRef.current) return
    const dx = Math.abs(e.clientX - startPosRef.current.x)
    const dy = Math.abs(e.clientY - startPosRef.current.y)
    if (dx > 5 || dy > 5) draggingRef.current = true
  }

  const onMouseUp: React.MouseEventHandler<HTMLDivElement> = () => {
    if (!isBoard) return
    startPosRef.current = null
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open project ${project.name}`}
      onClick={() => {
        if (isBoard && draggingRef.current) {
          draggingRef.current = false
          return
        }
        goToDetails()
      }}
      onKeyDown={onKeyNavigate}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      className={cn(
        "rounded-xl border border-border bg-background hover:shadow-lg/5 transition-shadow cursor-pointer focus:outline-none",
        className,
      )}
    >
      <div className="p-4">
        {children ?? (
          <>
            <ProjectCardHeader project={project} variant={variant} actions={actions} />
            <ProjectTitle project={project} variant={variant} />
            {!isBoard && <ProjectMetaRow project={project} />}
            <div className="mt-4 border-t border-border/60" />
            <ProjectCardFooter project={project} variant={variant} />
          </>
        )}
      </div>
    </div>
  )
}
