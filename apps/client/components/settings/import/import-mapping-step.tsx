"use client"

import { CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  mappingFields,
  sourceColumns,
  type MappingField,
} from "./import-types"

interface ImportMappingStepProps {
  columnMapping: Record<string, string>
  onMappingChange: (fieldId: string, value: string) => void
  onAutoMap: () => void
}

export function ImportMappingStep({
  columnMapping,
  onMappingChange,
  onAutoMap,
}: ImportMappingStepProps) {
  const requiredFields = mappingFields.filter((field) => field.required)
  const mappedRequiredCount = requiredFields.filter(
    (field) => columnMapping[field.id] !== "__skip"
  ).length
  const missingRequired = requiredFields.filter(
    (field) => columnMapping[field.id] === "__skip"
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
      <div className="space-y-4 rounded-2xl border border-border/70 bg-card/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Map your columns
            </p>
            <p className="text-xs text-muted-foreground">
              Match source columns to Dart fields. Required fields must be mapped.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onAutoMap}
          >
            Auto-map
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/70">
          <div className="grid grid-cols-[minmax(0,1fr)_220px] border-b border-border/60 bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground">
            <span>Expected field</span>
            <span>Map to column</span>
          </div>
          <div className="divide-y divide-border/70">
            {mappingFields.map((field) => (
              <div
                key={field.id}
                className="grid grid-cols-[minmax(0,1fr)_220px] items-center px-4 py-3"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-foreground">{field.label}</span>
                  {field.required && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      Required
                    </span>
                  )}
                </div>
                <Select
                  value={columnMapping[field.id]}
                  onValueChange={(value) => onMappingChange(field.id, value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__skip">Do not import</SelectItem>
                    {sourceColumns.map((column) => (
                      <SelectItem key={column.id} value={column.id}>
                        {column.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
          <p className="text-sm font-semibold text-foreground">Source columns</p>
          <div className="mt-4 space-y-3 text-xs text-muted-foreground">
            {sourceColumns.map((column) => (
              <div
                key={column.id}
                className="rounded-lg border border-border/60 bg-muted/20 p-3"
              >
                <div className="flex items-center justify-between text-sm text-foreground">
                  <span className="font-medium">{column.id}</span>
                  <span className="text-[10px] text-muted-foreground">
                    Sample values
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {column.samples.join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-muted/20 p-5">
          <p className="text-sm font-semibold text-foreground">Mapping status</p>
          <div className="mt-3 text-xs text-muted-foreground">
            Required fields mapped: {mappedRequiredCount}/{requiredFields.length}
          </div>
          {missingRequired.length > 0 ? (
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              {missingRequired.map((field) => (
                <div key={field.id} className="flex items-center gap-2">
                  <Circle className="h-4 w-4 text-muted-foreground" />
                  <span>{field.label} is not mapped</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-primary" weight="fill" />
              All required fields are mapped.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
