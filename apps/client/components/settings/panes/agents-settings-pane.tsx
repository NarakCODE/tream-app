"use client"

import {
  CheckCircle,
  PencilSimpleLine,
  Plus,
  Robot,
  ShieldCheck,
  SlidersHorizontal,
  Sparkle,
  UploadSimple,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export function AgentsSettingsPane() {
  const capabilityHighlights = [
    {
      id: "planning",
      label: "Plan work and break it into tasks with clear owners.",
      icon: CheckCircle,
    },
    {
      id: "review",
      label: "Review specs and docs for gaps before execution.",
      icon: ShieldCheck,
    },
    {
      id: "updates",
      label: "Draft status updates and summaries for the team.",
      icon: PencilSimpleLine,
    },
    {
      id: "automation",
      label: "Run checks and workflows with approval guardrails.",
      icon: Sparkle,
    },
  ] as const

  const moreAgents = [
    {
      id: "create",
      title: "Create a custom agent",
      description: "Design a specialist with your tools, rules, and API connections.",
      icon: Plus,
      variant: "create",
    },
    {
      id: "spec-writer",
      title: "Product spec writer",
      description: "Turns ideas into structured specs, milestones, and acceptance criteria.",
      icon: PencilSimpleLine,
      variant: "default",
    },
    {
      id: "qa-tester",
      title: "QA tester",
      description: "Finds regressions, drafts test plans, and highlights risks.",
      icon: CheckCircle,
      variant: "default",
    },
    {
      id: "ui-reviewer",
      title: "UI reviewer",
      description: "Audits UI for consistency, accessibility, and polish.",
      icon: Sparkle,
      variant: "default",
    },
    {
      id: "release",
      title: "Release manager",
      description: "Builds release notes, launch checklists, and stakeholder updates.",
      icon: ShieldCheck,
      variant: "default",
    },
    {
      id: "support",
      title: "Customer support drafts",
      description: "Writes empathetic replies with product-aware context.",
      icon: UsersThree,
      variant: "default",
    },
  ] as const

  const quickActions = [
    { id: "manage", label: "Manage agents", icon: SlidersHorizontal, variant: "outline" as const },
    { id: "invite", label: "Invite teammate", icon: UsersThree, variant: "outline" as const },
    { id: "connect", label: "Connect tools", icon: UploadSimple, variant: "default" as const },
  ] as const

  return (
    <div className="space-y-8">
      <div>
        <DialogTitle className="text-xl">Agents</DialogTitle>
        <DialogDescription className="mt-1">
          Create specialized AI teammates to plan, write, review, and ship work alongside you.
          Each agent has its own tools, rules, and permissions.
        </DialogDescription>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Your team</h3>
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs">
            Manage agents
          </Button>
        </div>
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Robot className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">Dart AI</span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Active
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Plan, manage, and build any task or project with the full context of your workspace.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs">
                View activity
              </Button>
              <Button size="sm" className="h-8 px-3 text-xs">
                Open agent
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {capabilityHighlights.map((capability) => {
              const Icon = capability.icon
              return (
                <div
                  key={capability.id}
                  className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground"
                >
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span>{capability.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">More agents</h3>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground">
            Browse all templates
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {moreAgents.map((agent) => {
            const Icon = agent.icon
            const isCreate = agent.variant === "create"
            return (
              <button
                key={agent.id}
                type="button"
                className={cn(
                  "flex h-full cursor-pointer flex-col gap-3 rounded-2xl border px-4 py-4 text-left transition",
                  isCreate
                    ? "border-dashed border-primary/50 bg-primary/5 text-foreground hover:border-primary/70"
                    : "border-border bg-card/70 text-foreground hover:border-primary/40 hover:bg-primary/5"
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl",
                    isCreate
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{agent.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {agent.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Quick actions</h3>
        <div className="flex flex-wrap gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Button key={action.id} variant={action.variant} size="sm" className="gap-2">
                <Icon className="h-4 w-4" />
                {action.label}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
