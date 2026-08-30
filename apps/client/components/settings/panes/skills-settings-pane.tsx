"use client"

import {
  PencilSimpleLine,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Sparkle,
  Star,
  UploadSimple,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

export function SkillsSettingsPane() {
  const installedSkills = [
    {
      id: "figma",
      name: "Figma to code",
      description: "Translate design frames into UI-ready components.",
      category: "Design",
      lastUsed: "2 days ago",
      enabled: true,
      icon: Sparkle,
    },
    {
      id: "ci",
      name: "CI failure triage",
      description: "Summarize failed checks and propose next fixes.",
      category: "DevOps",
      lastUsed: "Yesterday",
      enabled: true,
      icon: ShieldCheck,
    },
    {
      id: "meeting",
      name: "Meeting to action items",
      description: "Extract decisions and next steps from transcripts.",
      category: "Docs",
      lastUsed: "4 days ago",
      enabled: false,
      icon: PencilSimpleLine,
    },
  ] as const

  const skillLibrary = [
    {
      id: "release-notes",
      title: "Release notes generator",
      description: "Turns merged work into polished release notes.",
      icon: Star,
    },
    {
      id: "support",
      title: "Support reply drafts",
      description: "Creates empathetic responses with product context.",
      icon: UsersThree,
    },
    {
      id: "research",
      title: "User research summaries",
      description: "Condenses interviews into insights and themes.",
      icon: Sparkle,
    },
    {
      id: "roadmap",
      title: "Roadmap planner",
      description: "Builds milestones and timelines from strategy notes.",
      icon: SlidersHorizontal,
    },
  ] as const

  const insights = [
    { id: "top-skill", label: "Top skill", value: "Figma to code" },
    { id: "weekly-runs", label: "Runs this week", value: "28" },
    { id: "time-saved", label: "Estimated time saved", value: "6.4 hrs" },
  ] as const

  return (
    <div className="space-y-8">
      <div>
        <DialogTitle className="text-xl">Skills</DialogTitle>
        <DialogDescription className="mt-1">
          Skills are reusable workflows and toolchains. Add them to agents or use them directly
          to speed up repeat tasks.
        </DialogDescription>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Installed skills</h3>
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs">
            Manage library
          </Button>
        </div>
        <div className="space-y-3">
          {installedSkills.map((skill) => {
            const Icon = skill.icon
            return (
              <div
                key={skill.id}
                className="flex flex-col gap-4 rounded-2xl border border-border bg-card/70 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{skill.name}</p>
                      <p className="text-xs text-muted-foreground">{skill.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded-full border border-border/70 px-2 py-0.5">
                      {skill.category}
                    </span>
                    <span className="rounded-full border border-border/70 px-2 py-0.5">
                      Last used {skill.lastUsed}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      skill.enabled ? "text-emerald-400" : "text-muted-foreground"
                    )}
                  >
                    {skill.enabled ? "Active" : "Paused"}
                  </span>
                  <Switch defaultChecked={skill.enabled} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Skill library</h3>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground">
            Browse all
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {skillLibrary.map((skill) => {
            const Icon = skill.icon
            return (
              <button
                key={skill.id}
                type="button"
                className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-border bg-card/70 px-4 py-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{skill.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {skill.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Add a skill</h3>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Install from library
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <UploadSimple className="h-4 w-4" />
            Import from repo
          </Button>
          <Button size="sm" className="gap-2">
            <Sparkle className="h-4 w-4" />
            Create new skill
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Usage insights</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="rounded-2xl border border-border bg-muted/30 px-4 py-3"
            >
              <div className="text-xs text-muted-foreground">{insight.label}</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{insight.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
