"use client"

import { useRef } from "react"
import {
  UploadSimple,
  FileText,
  TrashSimple,
  Info,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr"
import { Button } from "@/components/ui/button"
import { expectedColumns, type UploadedFileInfo } from "./import-types"

interface ImportUploadStepProps {
  uploadedFile: UploadedFileInfo | null
  onFileSelect: (file: File) => void
  onFileRemove: () => void
}

export function ImportUploadStep({
  uploadedFile,
  onFileSelect,
  onFileRemove,
}: ImportUploadStepProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      onFileSelect(file)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
      <div className="flex h-full flex-col gap-4">
        {!uploadedFile && (
          <label className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center transition hover:border-primary/50 hover:bg-primary/5">
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              onChange={handleInputChange}
              accept=".csv,.xlsx,.xls"
            />
            <UploadSimple className="h-6 w-6 text-primary" />
            <p className="text-sm font-medium text-foreground">
              Browse or drag your file here
            </p>
            <p className="text-[11px] text-muted-foreground">
              CSV or XLSX up to 10MB
            </p>
          </label>
        )}

        {uploadedFile && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/70 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {uploadedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {uploadedFile.size} · Completed
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={onFileRemove}
              aria-label="Remove file"
            >
              <TrashSimple className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/70">
        <div className="grid grid-cols-[minmax(0,1fr)_100px] border-b border-border/60 px-4 py-3 text-xs font-semibold text-muted-foreground">
          <span>Expected column</span>
          <span className="text-right">Required</span>
        </div>
        <div className="divide-y divide-border/70">
          {expectedColumns.map((column) => (
            <div
              key={column.name}
              className="flex items-center justify-between px-4 py-3 text-sm"
            >
              <div className="flex items-center gap-2 text-foreground">
                <span>{column.name}</span>
                <Info className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-muted-foreground">
                {column.required ? (
                  <CheckCircle className="h-4 w-4 text-primary" weight="fill" />
                ) : (
                  "—"
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
