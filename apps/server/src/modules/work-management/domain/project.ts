export const PROJECT_STATUSES = [
  'PLANNED',
  'STARTED',
  'PAUSED',
  'COMPLETED',
  'CANCELED',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const WORK_PRIORITIES = [
  'NO_PRIORITY',
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
] as const;

export type WorkPriority = (typeof WORK_PRIORITIES)[number];

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  summary: string | null;
  description: string | null;
  status: ProjectStatus;
  priority: WorkPriority;
  leadId: string | null;
  startDate: Date | null;
  targetDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ProjectTeam {
  id: string;
  projectId: string;
  teamId: string;
  createdAt: Date;
}

export interface ProjectProgress {
  totalIssues: number;
  completedIssues: number;
  percent: number;
}

export const calculateProjectProgress = (
  totalIssues: number,
  completedIssues: number,
): ProjectProgress => {
  const percent =
    totalIssues === 0 ? 0 : Math.round((completedIssues / totalIssues) * 100);
  return {
    totalIssues,
    completedIssues,
    percent,
  };
};
