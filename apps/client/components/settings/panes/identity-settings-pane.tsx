"use client"

import Link from "next/link"
import { DiamondsFour } from "@phosphor-icons/react/dist/ssr"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"

export function IdentitySettingsPane() {
  const samlLink = "#"
  const scimLink = "#"

  const identityCards = [
    {
      id: "saml",
      title: "SAML SSO",
      description:
        "Allow users to log in with SAML single sign-on (SSO). Read the help center article for configuration steps.",
      helpHref: samlLink,
      toggleLabel: "Enable SAML SSO",
      enabled: false,
    },
    {
      id: "scim",
      title: "SCIM",
      description:
        "Use SCIM provisioning to automatically create, update, and delete users. Read the help center article for configuration steps.",
      helpHref: scimLink,
      toggleLabel: "Enable SCIM",
      enabled: false,
    },
  ] as const

  return (
    <div className="space-y-8">
      <div>
        <DialogTitle className="text-xl">Identity</DialogTitle>
        <DialogDescription className="mt-1">
          Secure and streamline user access. Enable SAML SSO for single sign-on
          and SCIM provisioning for automated account management.
        </DialogDescription>
      </div>

      <Separator />

      <div className="space-y-6">
        {identityCards.map((card) => (
          <div key={card.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {card.title}
              </p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {card.description.split("help center article")[0]}
              <Link
                href={card.helpHref}
                className="text-primary underline underline-offset-4"
              >
                help center article
              </Link>{" "}
              {card.description.split("help center article")[1]}
            </p>
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <span className="text-sm text-foreground">
                {card.toggleLabel}
              </span>
              <Switch disabled={!card.enabled} defaultChecked={card.enabled} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" className="gap-2">
          See plans
        </Button>
        <Button size="sm" className="gap-2">
          <DiamondsFour className="h-4 w-4" />
          Upgrade
        </Button>
      </div>
    </div>
  )
}
