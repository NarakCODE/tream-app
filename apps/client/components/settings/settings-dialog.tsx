"use client"

import { useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { SettingsSidebar } from "./settings-sidebar"
import { type SettingsItemId } from "./settings-types"
import { AccountSettingsPane } from "./panes/account-settings-pane"
import { NotificationsSettingsPane } from "./panes/notifications-settings-pane"
import { PreferencesSettingsPane } from "./panes/preferences-settings-pane"
import { TeammatesSettingsPane } from "./panes/teammates-settings-pane"
import { IdentitySettingsPane } from "./panes/identity-settings-pane"
import { TypesSettingsPane } from "./panes/types-settings-pane"
import { BillingSettingsPane } from "./panes/billing-settings-pane"
import { ImportSettingsPane } from "./panes/import-settings-pane"
import { AgentsSettingsPane } from "./panes/agents-settings-pane"
import { SkillsSettingsPane } from "./panes/skills-settings-pane"
import { PlaceholderSettingsPane } from "./panes/placeholder-settings-pane"

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="sm:max-w-5xl w-full p-0 rounded-3xl overflow-hidden sm:max-h-[85vh] sm:h-[85vh]"
      >
        <div className="flex h-full flex-col sm:flex-row sm:min-h-0">
          <SettingsSidebar
            activeItemId={activeItemId}
            onSelectItemId={setActiveItemId}
          />

          <main className="flex-1 min-h-0 overflow-y-auto px-6 py-6 sm:min-h-0">
            {activeItemId === "account" && <AccountSettingsPane />}
            {activeItemId === "notifications" && <NotificationsSettingsPane />}
            {activeItemId === "preferences" && <PreferencesSettingsPane />}
            {activeItemId === "teammates" && <TeammatesSettingsPane />}
            {activeItemId === "identity" && <IdentitySettingsPane />}
            {activeItemId === "types" && <TypesSettingsPane />}
            {activeItemId === "billing" && <BillingSettingsPane />}
            {activeItemId === "import" && <ImportSettingsPane />}
            {activeItemId === "agents" && <AgentsSettingsPane />}
            {activeItemId === "skills" && <SkillsSettingsPane />}
            {activeItemId !== "account" &&
              activeItemId !== "notifications" &&
              activeItemId !== "preferences" &&
              activeItemId !== "teammates" &&
              activeItemId !== "identity" &&
              activeItemId !== "types" &&
              activeItemId !== "billing" &&
              activeItemId !== "import" &&
              activeItemId !== "agents" &&
              activeItemId !== "skills" && <PlaceholderSettingsPane />}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  )
}
