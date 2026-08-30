"use client"

import { useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { CopySimple } from "@phosphor-icons/react/dist/ssr"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { SettingSection } from "../shared/setting-section"
import { SettingRow } from "../shared/setting-row"
import { getUserAvatarUrl } from "@/lib/dicebear"

export function AccountSettingsPane() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [photoPreview, setPhotoPreview] = useState(getUserAvatarUrl("Khánh Dương"))
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const { theme, setTheme } = useTheme()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [objectUrl])

  const handleRequestPhoto = () => {
    fileInputRef.current?.click()
  }

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const nextUrl = URL.createObjectURL(file)
    setPhotoPreview(nextUrl)
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return nextUrl
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <DialogTitle className="text-xl">Account</DialogTitle>
        <DialogDescription className="mt-1">
          Manage your personal information and account preferences.
        </DialogDescription>
      </div>

      <Separator />

      <SettingSection title="Information">
        <SettingRow
          label="Profile photo"
          description="This image appears across your workspace."
        >
          <div className="flex flex-wrap items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={photoPreview} />
              <AvatarFallback>KD</AvatarFallback>
            </Avatar>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={handleRequestPhoto}
              >
                Change photo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
                aria-label="Upload profile photo"
              />
            </div>
          </div>
        </SettingRow>
        <SettingRow label="Full name">
          <Input defaultValue="Khánh Dương" className="h-9 text-sm" />
        </SettingRow>
        <SettingRow
          label="Email address"
          description="Notifications will be sent to this address."
        >
          <Input
            defaultValue="duongdaikhanh2502@gmail.com"
            type="email"
            className="h-9 text-sm"
            readOnly
          />
        </SettingRow>
        <SettingRow label="Password" description="Last changed 2 months ago.">
          <div className="flex items-center justify-between gap-3 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <span>••••••••</span>
            <Button variant="outline" size="sm" className="h-8 px-3 text-xs">
              Set password
            </Button>
          </div>
        </SettingRow>
      </SettingSection>

      <Separator />

      <SettingSection title="Appearance">
        <SettingRow label="Theme">
          <Select
            value={isMounted ? theme ?? "system" : "system"}
            onValueChange={(value) => setTheme(value)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select theme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System default</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          label="Open links in app"
          description="When you click a link, open it in the app if possible."
        >
          <Switch defaultChecked />
        </SettingRow>
      </SettingSection>

      <Separator />

      <SettingSection title="Location and time">
        <SettingRow label="Timezone">
          <Select defaultValue="asia-saigon">
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asia-saigon">Saigon, Asia</SelectItem>
              <SelectItem value="asia-bangkok">Bangkok, Asia</SelectItem>
              <SelectItem value="utc">UTC</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          label="Start weeks on"
          description="The first day of the week in your calendars."
        >
          <Select defaultValue="monday">
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select day" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monday">Monday</SelectItem>
              <SelectItem value="sunday">Sunday</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingSection>

      <Separator />

      <SettingSection title="Authentication">
        <SettingRow
          label="Token"
          description="Manage your API key, a bearer authentication token."
        >
          <Button variant="outline" size="sm" className="h-8 gap-2 px-3 text-xs">
            + Create authentication token
          </Button>
        </SettingRow>
        <SettingRow
          label="User ID"
          description="Share this ID if you contact support."
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value="7nsqk2c2v1R"
              readOnly
              className="font-mono text-sm"
            />
            <Button variant="ghost" size="icon-sm" className="shrink-0">
              <CopySimple className="h-4 w-4" />
            </Button>
          </div>
        </SettingRow>
      </SettingSection>
    </div>
  )
}
