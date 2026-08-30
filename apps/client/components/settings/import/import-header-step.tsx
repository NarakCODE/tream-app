"use client"

import { CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { previewRows } from "./import-types"

interface ImportHeaderStepProps {
  headerRow: number
  onHeaderRowChange: (rowId: number) => void
}

export function ImportHeaderStep({
  headerRow,
  onHeaderRowChange,
}: ImportHeaderStepProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
      <div className="space-y-4 rounded-2xl border border-border/70 bg-card/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Pick the header row
            </p>
            <p className="text-xs text-muted-foreground">
              Choose the row that contains your column names.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Header row</span>
            <Select
              value={String(headerRow)}
              onValueChange={(value) => onHeaderRowChange(Number(value))}
            >
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {previewRows.map((row) => (
                  <SelectItem key={row.id} value={String(row.id)}>
                    Row {row.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/70">
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[60px_repeat(5,minmax(120px,1fr))] gap-0 border-b border-border/60 bg-muted/50 px-2 py-2 text-[11px] font-semibold text-muted-foreground">
                <span className="pl-2">Row</span>
                <span>Col A</span>
                <span>Col B</span>
                <span>Col C</span>
                <span>Col D</span>
                <span>Col E</span>
              </div>
              <div className="divide-y divide-border/70">
                {previewRows.map((row) => {
                  const isSelected = headerRow === row.id
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => onHeaderRowChange(row.id)}
                      className={cn(
                        "grid w-full grid-cols-[60px_repeat(5,minmax(120px,1fr))] items-center px-2 py-3 text-left text-sm cursor-pointer",
                        isSelected
                          ? "bg-primary/10 text-foreground font-medium"
                          : "bg-transparent text-muted-foreground hover:bg-muted/30"
                      )}
                    >
                      <span className="flex items-center gap-2 pl-2 text-xs font-semibold">
                        {isSelected ? (
                          <CheckCircle
                            className="h-4 w-4 text-primary"
                            weight="fill"
                          />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                        {row.id}
                      </span>
                      {row.cells.map((cell, index) => (
                        <span
                          key={index}
                          className={cn(isSelected && "text-foreground")}
                        >
                          {cell}
                        </span>
                      ))}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
          <p className="text-sm font-semibold text-foreground">File insights</p>
          <div className="mt-4 space-y-3 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Detected columns</span>
              <span className="text-foreground font-medium">5 columns</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Rows scanned</span>
              <span className="text-foreground font-medium">2,430 rows</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Delimiter</span>
              <span className="text-foreground font-medium">Comma</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Encoding</span>
              <span className="text-foreground font-medium">UTF-8</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-muted/20 p-5">
          <p className="text-sm font-semibold text-foreground">How we use this</p>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            We will use row {headerRow} as the field names, then start importing
            from the next row.
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-primary" weight="fill" />
            First data row will be row {headerRow + 1}.
          </div>
        </div>
      </div>
    </div>
  )
}
