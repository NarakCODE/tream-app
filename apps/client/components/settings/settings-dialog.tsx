"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { SettingsSidebar } from "./settings-sidebar"
import type { SettingsItemId } from "./types"

// ─────────────────────────────────────────────
// Simple loading skeleton
// ─────────────────────────────────────────────

function PaneSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-md bg-muted" />
        <div className="h-4 w-80 rounded-md bg-muted" />
      </div>
      <div className="h-px w-full bg-border" />
      <div className="space-y-4">
        <div className="h-4 w-32 rounded-md bg-muted" />
        <div className="h-10 w-full rounded-md bg-muted" />
        <div className="h-10 w-full rounded-md bg-muted" />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Dynamic imports (code-split each pane)
// ─────────────────────────────────────────────

const AccountSettingsPane = dynamic(
  () =>
    import("./panes/account-settings-pane").then(
      (m) => m.AccountSettingsPane
    ),
  { loading: () => <PaneSkeleton /> }
)

const NotificationsSettingsPane = dynamic(
  () =>
    import("./panes/notifications-settings-pane").then(
      (m) => m.NotificationsSettingsPane
    ),
  { loading: () => <PaneSkeleton /> }
)

const PreferencesSettingsPane = dynamic(
  () =>
    import("./panes/preferences-settings-pane").then(
      (m) => m.PreferencesSettingsPane
    ),
  { loading: () => <PaneSkeleton /> }
)

const TeammatesSettingsPane = dynamic(
  () =>
    import("./panes/teammates-settings-pane").then(
      (m) => m.TeammatesSettingsPane
    ),
  { loading: () => <PaneSkeleton /> }
)

const IdentitySettingsPane = dynamic(
  () =>
    import("./panes/identity-settings-pane").then(
      (m) => m.IdentitySettingsPane
    ),
  { loading: () => <PaneSkeleton /> }
)

const TypesSettingsPane = dynamic(
  () =>
    import("./panes/types-settings-pane").then((m) => m.TypesSettingsPane),
  { loading: () => <PaneSkeleton /> }
)

const BillingSettingsPane = dynamic(
  () =>
    import("./panes/billing-settings-pane").then(
      (m) => m.BillingSettingsPane
    ),
  { loading: () => <PaneSkeleton /> }
)

const ImportSettingsPane = dynamic(
  () =>
    import("./panes/import-settings-pane").then((m) => m.ImportSettingsPane),
  { loading: () => <PaneSkeleton /> }
)

const AgentsSettingsPane = dynamic(
  () =>
    import("./panes/agents-settings-pane").then((m) => m.AgentsSettingsPane),
  { loading: () => <PaneSkeleton /> }
)

const SkillsSettingsPane = dynamic(
  () =>
    import("./panes/skills-settings-pane").then((m) => m.SkillsSettingsPane),
  { loading: () => <PaneSkeleton /> }
)

// ─────────────────────────────────────────────
// Main Dialog
// ─────────────────────────────────────────────

export interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTab?: SettingsItemId
}

export function SettingsDialog({
  open,
  onOpenChange,
  defaultTab = "account",
}: SettingsDialogProps) {
  const [activeItemId, setActiveItemId] = useState<SettingsItemId>(defaultTab)

  const renderPane = () => {
    switch (activeItemId) {
      case "account":
        return <AccountSettingsPane />
      case "notifications":
        return <NotificationsSettingsPane />
      case "preferences":
        return <PreferencesSettingsPane />
      case "teammates":
        return <TeammatesSettingsPane />
      case "identity":
        return <IdentitySettingsPane />
      case "types":
        return <TypesSettingsPane />
      case "billing":
        return <BillingSettingsPane />
      case "import":
        return <ImportSettingsPane />
      case "agents":
        return <AgentsSettingsPane />
      case "skills":
        return <SkillsSettingsPane />
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="sm:max-w-5xl w-full p-0 rounded-3xl overflow-hidden sm:max-h-[85vh] sm:h-[85vh]"
      >
        <div className="flex h-full flex-col sm:flex-row sm:min-h-0">
          <SettingsSidebar
            activeItemId={activeItemId}
            onItemChange={setActiveItemId}
          />

          <main className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
            {renderPane()}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  )
}
