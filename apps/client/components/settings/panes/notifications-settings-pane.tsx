"use client"

import { PencilSimpleLine, Star } from "@phosphor-icons/react/dist/ssr"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { SettingToggleRow } from "../shared/setting-toggle-row"
import { SettingCard } from "../shared/setting-card"

export function NotificationsSettingsPane() {
  const methodItems = [
    {
      id: "in-app",
      title: "In-app",
      description: "Notifications will go into your Inbox",
      enabled: true,
    },
    {
      id: "email",
      title: "Email",
      description: "You will receive emails about events",
      enabled: true,
    },
  ] as const

  const detailCards = [
    {
      id: "recommended",
      title: "Recommended settings",
      description:
        "Stick with defaults so you never miss an important update and avoid spam.",
      icon: Star,
      highlighted: true,
    },
    {
      id: "custom",
      title: "Custom settings",
      description:
        "Fine-tune notifications to only receive updates you care about.",
      icon: PencilSimpleLine,
      highlighted: false,
    },
  ] as const

  return (
    <div className="space-y-8">
      <div>
        <DialogTitle className="text-xl">Notifications</DialogTitle>
        <DialogDescription className="mt-1">
          Stay in the loop without the noise. Choose where you get updates, and
          customize which activities trigger notifications.
        </DialogDescription>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Methods</h3>
        <div className="space-y-3">
          {methodItems.map((item) => (
            <SettingToggleRow
              key={item.id}
              label={item.title}
              description={item.description}
              defaultChecked={item.enabled}
            />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Details</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {detailCards.map((card) => (
            <SettingCard
              key={card.id}
              title={card.title}
              description={card.description}
              icon={card.icon}
              highlighted={card.highlighted}
              onClick={() => {}}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
