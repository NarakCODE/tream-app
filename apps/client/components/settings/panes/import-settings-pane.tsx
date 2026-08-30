"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { ImportStepper } from "../import/import-stepper"
import { ImportUploadStep } from "../import/import-upload-step"
import { ImportHeaderStep } from "../import/import-header-step"
import { ImportMappingStep } from "../import/import-mapping-step"
import { ImportProgressStep } from "../import/import-progress-step"
import {
  importSteps,
  mappingFields,
  type UploadedFileInfo,
} from "../import/import-types"

export function ImportSettingsPane() {
  const [activeStep, setActiveStep] = useState<number>(1)
  const [headerRow, setHeaderRow] = useState<number>(1)
  const [importStatus, setImportStatus] = useState<"idle" | "running" | "done">("idle")
  const [importProgress, setImportProgress] = useState<number>(0)
  const [uploadedFile, setUploadedFile] = useState<UploadedFileInfo | null>(null)

  const [columnMapping, setColumnMapping] = useState<Record<string, string>>(
    mappingFields.reduce((acc, field) => {
      acc[field.id] = field.suggested ?? "__skip"
      return acc
    }, {} as Record<string, string>)
  )

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.min(
      sizes.length - 1,
      Math.floor(Math.log(bytes) / Math.log(k))
    )
    const value = bytes / Math.pow(k, i)
    return `${value.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`
  }

  const handleFileSelect = (file: File) => {
    const extension = file.name.split(".").pop()?.toUpperCase() ?? "FILE"
    setUploadedFile({
      name: file.name,
      size: formatBytes(file.size),
      type: extension,
    })
  }

  const handleFileRemove = () => {
    setUploadedFile(null)
  }

  const handleAutoMap = () => {
    setColumnMapping((prev) => {
      const next = { ...prev }
      mappingFields.forEach((field) => {
        next[field.id] = field.suggested ?? "__skip"
      })
      return next
    })
  }

  const handleMappingChange = (fieldId: string, value: string) => {
    setColumnMapping((prev) => ({
      ...prev,
      [fieldId]: value,
    }))
  }

  const resetImportFlow = () => {
    setActiveStep(1)
    setHeaderRow(1)
    setUploadedFile(null)
    setImportStatus("idle")
    setImportProgress(0)
    setColumnMapping(
      mappingFields.reduce((acc, field) => {
        acc[field.id] = field.suggested ?? "__skip"
        return acc
      }, {} as Record<string, string>)
    )
  }

  useEffect(() => {
    if (activeStep !== 4) {
      setImportStatus("idle")
      setImportProgress(0)
    }
  }, [activeStep])

  useEffect(() => {
    if (activeStep === 4 && importStatus === "idle") {
      setImportProgress(0)
      setImportStatus("running")
    }
  }, [activeStep, importStatus])

  useEffect(() => {
    if (activeStep !== 4 || importStatus !== "running") {
      return
    }

    const interval = setInterval(() => {
      setImportProgress((prev) => {
        const increment = Math.floor(Math.random() * 8) + 6
        const next = Math.min(100, prev + increment)
        if (next >= 100) {
          setImportStatus("done")
        }
        return next
      })
    }, 450)

    return () => clearInterval(interval)
  }, [activeStep, importStatus])

  return (
    <div className="space-y-8">
      <div>
        <DialogTitle className="text-xl">Import</DialogTitle>
        <DialogDescription className="mt-1">
          Bring your existing data in just a few steps. Upload your file, map your
          properties, and import tasks seamlessly.
        </DialogDescription>
      </div>

      <Separator />

      <div className="space-y-6">
        <ImportStepper
          activeStep={activeStep}
          onStepClick={(stepId) => setActiveStep(stepId)}
        />

        {activeStep === 1 && (
          <ImportUploadStep
            uploadedFile={uploadedFile}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
          />
        )}

        {activeStep === 2 && (
          <ImportHeaderStep
            headerRow={headerRow}
            onHeaderRowChange={setHeaderRow}
          />
        )}

        {activeStep === 3 && (
          <ImportMappingStep
            columnMapping={columnMapping}
            onMappingChange={handleMappingChange}
            onAutoMap={handleAutoMap}
          />
        )}

        {activeStep === 4 && (
          <ImportProgressStep
            importStatus={importStatus}
            importProgress={importProgress}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {activeStep < 4 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-3"
              onClick={resetImportFlow}
            >
              Cancel import
            </Button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-4"
              onClick={() => setActiveStep((step) => Math.max(1, step - 1))}
              disabled={activeStep === 1}
            >
              Back
            </Button>
            {activeStep < importSteps.length - 1 && (
              <Button
                type="button"
                size="sm"
                className="h-9 px-4"
                onClick={() =>
                  setActiveStep((step) => Math.min(importSteps.length, step + 1))
                }
              >
                Next
              </Button>
            )}
            {activeStep === importSteps.length - 1 && (
              <Button
                type="button"
                size="sm"
                className="h-9 px-4"
                onClick={() => {
                  setActiveStep(4)
                  setImportProgress(0)
                  setImportStatus("running")
                }}
              >
                Start import
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
