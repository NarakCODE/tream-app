"use client"

import {
  CheckCircle,
  Circle,
  CircleNotch,
} from "@phosphor-icons/react/dist/ssr"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { importStages } from "./import-types"

interface ImportProgressStepProps {
  importStatus: "idle" | "running" | "done"
  importProgress: number
  totalRows?: number
  errorRows?: number
  skippedRows?: number
}

export function ImportProgressStep({
  importStatus,
  importProgress,
  totalRows = 2430,
  errorRows = 17,
  skippedRows = 6,
}: ImportProgressStepProps) {
  const processedRows = Math.min(
    totalRows,
    Math.round((importProgress / 100) * totalRows)
  )
  const completedRows = totalRows - errorRows - skippedRows

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
      <div className="space-y-5 rounded-2xl border border-border/70 bg-card/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {importStatus === "done" ? "Import complete" : "Importing tasks"}
            </p>
            <p className="text-xs text-muted-foreground">
              {importStatus === "done"
                ? "Review the summary and open your imported tasks."
                : "We are validating and creating tasks from your file."}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {importStatus === "running" ? (
              <>
                <CircleNotch className="h-4 w-4 animate-spin text-primary" />
                Importing
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 text-primary" weight="fill" />
                Finished
              </>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Progress value={importProgress} />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {importStatus === "done"
                ? `Processed ${totalRows} rows`
                : `Processing ${processedRows} / ${totalRows} rows`}
            </span>
            <span className="text-foreground font-medium">{importProgress}%</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
          <p className="text-xs font-semibold text-muted-foreground">
            Import activity
          </p>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            {importStages.map((stage, index) => {
              const isComplete = importProgress >= stage.threshold
              const isActive =
                importProgress < stage.threshold &&
                (index === 0 ||
                  importProgress >= importStages[index - 1].threshold)
              return (
                <div key={stage.id} className="flex items-center gap-2">
                  {isComplete ? (
                    <CheckCircle
                      className="h-4 w-4 text-primary"
                      weight="fill"
                    />
                  ) : isActive ? (
                    <CircleNotch className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={cn(isComplete && "text-foreground")}>
                    {stage.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
          <p className="text-sm font-semibold text-foreground">Import summary</p>
          <div className="mt-4 space-y-3 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Total rows</span>
              <span className="text-foreground font-medium">{totalRows}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Imported tasks</span>
              <span className="text-foreground font-medium">
                {importStatus === "done"
                  ? completedRows
                  : Math.max(0, processedRows - 5)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Skipped rows</span>
              <span className="text-foreground font-medium">{skippedRows}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Errors</span>
              <span className="text-foreground font-medium">{errorRows}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-muted/20 p-5">
          <p className="text-sm font-semibold text-foreground">Next actions</p>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            {importStatus === "done"
              ? "Open the created tasks or download an error report."
              : "You can leave this open while the import completes."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" size="sm" className="h-9 px-4">
              View tasks
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-4"
            >
              Download error report
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
