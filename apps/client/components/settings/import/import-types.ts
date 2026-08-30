export interface ImportStep {
  id: number
  label: string
}

export const importSteps: readonly ImportStep[] = [
  { id: 1, label: "Upload" },
  { id: 2, label: "Select header" },
  { id: 3, label: "Map columns" },
  { id: 4, label: "Import" },
] as const

export interface ExpectedColumn {
  name: string
  required: boolean
}

export const expectedColumns: readonly ExpectedColumn[] = [
  { name: "ID", required: false },
  { name: "Title", required: true },
  { name: "Board", required: false },
  { name: "Status", required: false },
  { name: "Description", required: false },
  { name: "Parent ID", required: false },
  { name: "Assignee emails", required: false },
  { name: "Tags", required: false },
  { name: "Priority", required: false },
] as const

export interface PreviewRow {
  id: number
  cells: string[]
}

export const previewRows: readonly PreviewRow[] = [
  { id: 1, cells: ["Task Name", "Status", "Owner", "Due Date", "Priority"] },
  { id: 2, cells: ["Finalize onboarding flow", "In progress", "Liam", "2026-02-10", "High"] },
  { id: 3, cells: ["Scope pricing page refresh", "Not started", "Ari", "2026-02-18", "Medium"] },
  { id: 4, cells: ["Launch client feedback survey", "Blocked", "Maya", "2026-02-25", "High"] },
  { id: 5, cells: ["Update Q1 roadmap", "In review", "Noah", "2026-03-01", "Low"] },
] as const

export interface SourceColumn {
  id: string
  samples: string[]
}

export const sourceColumns: readonly SourceColumn[] = [
  { id: "Task Name", samples: ["Finalize onboarding flow", "Update Q1 roadmap"] },
  { id: "Status", samples: ["In progress", "Blocked"] },
  { id: "Owner", samples: ["Liam", "Maya"] },
  { id: "Due Date", samples: ["2026-02-10", "2026-03-01"] },
  { id: "Priority", samples: ["High", "Medium"] },
] as const

export interface MappingField {
  id: string
  label: string
  required: boolean
  suggested?: string
}

export const mappingFields: readonly MappingField[] = [
  { id: "title", label: "Title", required: true, suggested: "Task Name" },
  { id: "status", label: "Status", required: false, suggested: "Status" },
  { id: "assignee", label: "Assignee", required: false, suggested: "Owner" },
  { id: "dueDate", label: "Due date", required: false, suggested: "Due Date" },
  { id: "priority", label: "Priority", required: false, suggested: "Priority" },
  { id: "description", label: "Description", required: false, suggested: "__skip" },
  { id: "tags", label: "Tags", required: false, suggested: "__skip" },
] as const

export interface ImportStage {
  id: string
  label: string
  threshold: number
}

export const importStages: readonly ImportStage[] = [
  { id: "validate", label: "Validating headers", threshold: 10 },
  { id: "map", label: "Mapping columns", threshold: 35 },
  { id: "create", label: "Creating tasks", threshold: 75 },
  { id: "finalize", label: "Finalizing import", threshold: 100 },
] as const

export interface UploadedFileInfo {
  name: string
  size: string
  type: string
}
