"use client"

import { CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr"
import { cn } from "@/lib/utils"
import { importSteps } from "./import-types"

interface ImportStepperProps {
  activeStep: number
  onStepClick: (stepId: number) => void
}

export function ImportStepper({ activeStep, onStepClick }: ImportStepperProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {importSteps.map((step, index) => {
        const isActive = step.id === activeStep
        const isComplete = step.id < activeStep
        const isLast = index === importSteps.length - 1
        const StepIcon = isComplete ? CheckCircle : Circle

        return (
          <div
            key={step.id}
            className="flex items-center gap-3 text-sm text-muted-foreground"
          >
            <button
              type="button"
              onClick={() => onStepClick(step.id)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 transition-colors",
                isActive
                  ? "border-primary/50 bg-primary/10 text-primary font-medium"
                  : isComplete
                  ? "border-primary/40 bg-primary/5 text-primary/80"
                  : "border-border text-muted-foreground hover:border-border/80"
              )}
            >
              <StepIcon
                className="h-4 w-4"
                weight={isComplete ? "fill" : "regular"}
              />
              <span className="text-xs font-semibold">{step.id}.</span>
              <span>{step.label}</span>
            </button>
            {!isLast && <span className="text-sm text-muted-foreground/60">›</span>}
          </div>
        )
      })}
    </div>
  )
}
