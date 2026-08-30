"use client"

import { useState } from "react"
import {
  CheckCircle,
  CircleNotch,
  LockSimple,
  Plus,
  Spinner,
} from "@phosphor-icons/react/dist/ssr"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export function TypesSettingsPane() {
  const typeNav = [
    { id: "task", label: "Task", icon: "☑" },
    { id: "project", label: "Project", icon: "▲" },
    { id: "workstream", label: "Workstream", icon: "★" },
  ] as const
  const [activeType, setActiveType] =
    useState<(typeof typeNav)[number]["id"]>("task")

  const workflowGroups = [
    {
      id: "unstarted",
      label: "Unstarted",
      steps: [
        {
          id: "todo",
          label: "To-do",
          description: "Tasks that are not started yet",
          state: "todo",
          locked: true,
        },
      ],
    },
    {
      id: "started",
      label: "Started",
      steps: [
        {
          id: "doing",
          label: "Doing",
          description: "Tasks that are in progress",
          state: "doing",
          locked: false,
        },
      ],
    },
    {
      id: "finished",
      label: "Finished",
      steps: [
        {
          id: "done",
          label: "Done",
          description: "Tasks that are done",
          state: "done",
          locked: true,
        },
      ],
    },
    { id: "canceled", label: "Canceled", steps: [] },
  ] as const

  const stepIcon = (state?: string) => {
    switch (state) {
      case "doing":
        return { Icon: CircleNotch, className: "text-blue-500" }
      case "done":
        return { Icon: CheckCircle, className: "text-green-500" }
      default:
        return { Icon: Spinner, className: "text-muted-foreground" }
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="border-b border-border/60 bg-card/70 lg:border-b-0 lg:border-r">
          <div className="px-4 py-3 border-b border-border/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Types
          </div>
          <div>
            {typeNav.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveType(item.id)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-sm transition",
                  activeType === item.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/40"
                )}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6 bg-background/40 p-6">
          <div>
            <p className="text-sm font-semibold text-foreground">Edit type</p>
            <div className="mt-4 flex flex-col gap-2">
              <label className="text-xs font-medium text-muted-foreground">
                Name
              </label>
              <Input
                value={typeNav.find((t) => t.id === activeType)?.label}
                readOnly
                className="h-9 text-sm"
              />
            </div>
          </div>

          <Separator className="bg-border/80" />

          <div className="space-y-4 pt-2">
            <p className="text-sm font-semibold text-foreground">Workflow</p>
            <div className="space-y-6">
              {workflowGroups.map((group) => (
                <div key={group.id} className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>{group.label}</span>
                    <button
                      type="button"
                      className="cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {group.steps.length > 0 && (
                    <div className="space-y-2">
                      {group.steps.map((step) => {
                        const { Icon, className } = stepIcon(step.state)
                        return (
                          <div
                            key={step.id}
                            className="flex items-center gap-4 rounded-2xl bg-muted/20 px-4 py-3"
                          >
                            <span
                              className={cn(
                                "flex h-6 w-6 items-center justify-center",
                                className
                              )}
                            >
                              <Icon
                                className="h-4 w-4"
                                weight={
                                  step.state === "doing" ? "bold" : "regular"
                                }
                              />
                            </span>
                            <div className="flex flex-1 items-center gap-4 text-sm text-foreground">
                              <span className="font-medium">{step.label}</span>
                              <span className="flex-1 text-left text-muted-foreground">
                                {step.description}
                              </span>
                            </div>
                            <div className="text-muted-foreground">
                              {step.locked ? (
                                <LockSimple className="h-4 w-4" />
                              ) : step.id === "doing" ? null : (
                                <Plus className="h-4 w-4" />
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
