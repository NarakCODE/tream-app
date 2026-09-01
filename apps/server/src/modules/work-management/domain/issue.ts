import type { WorkPriority } from './project';

export const ISSUE_STATUS_CATEGORIES = [
  'BACKLOG',
  'UNSTARTED',
  'STARTED',
  'COMPLETED',
  'CANCELED',
  'DUPLICATE',
] as const;

export type IssueStatusCategory = (typeof ISSUE_STATUS_CATEGORIES)[number];

export interface IssueStatus {
  id: string;
  teamId: string;
  name: string;
  category: IssueStatusCategory;
  position: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Issue {
  id: string;
  workspaceId: string;
  teamId: string;
  number: number;
  identifier: string;
  title: string;
  description: string | null;
  statusId: string;
  priority: WorkPriority;
  assigneeId: string | null;
  projectId: string | null;
  cycleId: string | null;
  dueDate: Date | null;
  estimate: number | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const shouldRollOverToNextCycle = (
  category: IssueStatusCategory,
): boolean => category === 'UNSTARTED' || category === 'STARTED';
