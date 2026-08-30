"use client"

import { useEffect, useState } from "react"
import { CopySimple } from "@phosphor-icons/react/dist/ssr"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { SettingSection } from "../shared/setting-section"
import { SettingRow } from "../shared/setting-row"
import { getGlassAvatarUrl } from "@/lib/dicebear"

export function PreferencesSettingsPane() {
  const [copied, setCopied] = useState(false)
  const workspaceName = "Jason's Workspace"
  const workspaceId = "p2r2nVMXkdxl"

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(workspaceId)
      setCopied(true)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <DialogTitle className="text-xl">Preferences</DialogTitle>
        <DialogDescription className="mt-1">
          Manage your workspace details, and set global workspace preferences.
        </DialogDescription>
      </div>

      <Separator />

      <SettingSection title="Information">
        <SettingRow
          label="Workspace"
          description="This is the name shown across the workspace."
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl overflow-hidden border border-border/60 shadow-xs">
              <img
                src={getGlassAvatarUrl("Workspace", { radius: 24 })}
                alt="Workspace"
                className="h-full w-full object-cover"
              />
            </div>
            <Input defaultValue={workspaceName} className="h-9 text-sm" />
          </div>
        </SettingRow>
      </SettingSection>

      <Separator />

      <SettingSection title="Preferences">
        <SettingRow
          label="Workspace ID"
          description="Use this ID when connecting integrations."
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              readOnly
              value={workspaceId}
              className="font-mono text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleCopyId}
            >
              <CopySimple className="h-4 w-4" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </SettingRow>
      </SettingSection>
    </div>
  )
}
