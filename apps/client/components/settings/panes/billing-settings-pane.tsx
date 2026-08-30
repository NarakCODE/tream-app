"use client"

import { useState } from "react"
import { CheckCircle } from "@phosphor-icons/react/dist/ssr"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

export function BillingSettingsPane() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly")

  const plans = [
    {
      id: "personal",
      name: "Personal",
      price: "$0",
      period: "per teammate per month",
      badge: null as string | null,
      highlight: true,
      ctaLabel: "Current plan",
    },
    {
      id: "premium",
      name: "Premium",
      price: "$8",
      period: "per teammate per month",
      badge: "-20%",
      highlight: false,
      ctaLabel: "Upgrade",
    },
    {
      id: "business",
      name: "Business",
      price: "$12",
      period: "per teammate per month",
      badge: "-20%",
      highlight: false,
      ctaLabel: "Upgrade",
    },
  ] as const

  const features = [
    { id: "teammates", label: "Teammates", values: ["Up to 4", "Unlimited", "Unlimited"] },
    { id: "tasks", label: "Tasks", values: ["Unlimited", "Unlimited", "Unlimited"] },
    { id: "docs", label: "Docs", values: ["Unlimited", "Unlimited", "Unlimited"] },
    { id: "storage", label: "Storage", values: ["Unlimited", "Unlimited", "Unlimited"] },
    { id: "ai-model", label: "AI model usage", values: ["Unlimited", "Unlimited", "Unlimited"] },
    {
      id: "ai-agents",
      label: "AI agents",
      values: [false, true, true],
    },
    {
      id: "ai-execution",
      label: "AI task execution",
      values: [false, true, true],
    },
    {
      id: "ai-reporting",
      label: "AI reporting",
      values: [false, true, true],
    },
    {
      id: "ai-filling",
      label: "AI task property filling",
      values: [false, true, true],
    },
  ] as const

  const renderValue = (value: string | boolean) => {
    if (typeof value === "string") {
      return <span className="text-sm text-foreground">{value}</span>
    }
    if (value) {
      return <CheckCircle className="h-4 w-4 text-emerald-500" weight="fill" />
    }
    return <span className="text-sm text-muted-foreground">—</span>
  }

  return (
    <div className="space-y-8">
      <div>
        <DialogTitle className="text-xl">Plans and billing</DialogTitle>
        <DialogDescription className="mt-1">
          Manage your subscription and billing preferences. Review your current plan,
          compare features, and adjust your plan as your team grows.
        </DialogDescription>
      </div>

      <Separator />

      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-foreground">Billing period</span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={cn(
                  "font-medium",
                  billingPeriod === "monthly" && "text-primary"
                )}
              >
                Monthly
              </span>
              <Switch
                checked={billingPeriod === "annual"}
                onCheckedChange={(checked) =>
                  setBillingPeriod(checked ? "annual" : "monthly")
                }
              />
              <span
                className={cn(
                  "font-medium",
                  billingPeriod === "annual" && "text-primary"
                )}
              >
                Annually
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-background/60">
          <div className="grid grid-cols-4 border-b border-border bg-muted/40 px-4 py-4 text-sm font-semibold text-foreground">
            <div></div>
            {plans.map((plan) => (
              <div key={plan.id} className="px-3">
                <div className="flex items-center gap-2">
                  <span>{plan.name}</span>
                  {plan.badge && (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                      {plan.badge}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-semibold">{plan.price}</span>
                  <span className="text-xs text-muted-foreground">
                    {plan.period}
                  </span>
                </div>
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 w-full text-xs",
                      plan.highlight
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border bg-transparent text-foreground"
                    )}
                  >
                    {plan.ctaLabel}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="divide-y divide-border/80 text-xs">
            {features.map((feature) => (
              <div
                key={feature.id}
                className="grid grid-cols-4 items-center px-4 py-3"
              >
                <div className="pr-4 text-sm text-foreground font-medium">
                  {feature.label}
                </div>
                {feature.values.map((val, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-center border-l border-border/70 px-3 text-center"
                  >
                    {renderValue(val)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
