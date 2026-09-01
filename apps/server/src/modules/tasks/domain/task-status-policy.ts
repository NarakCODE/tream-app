import type { TaskStatus } from './task';

export const TASK_PATCH_STATUSES = [
  'TODO',
  'IN_PROGRESS',
] as const satisfies readonly TaskStatus[];

export type TaskPatchStatus = (typeof TASK_PATCH_STATUSES)[number];

export const canPatchTaskStatus = (
  currentStatus: TaskStatus,
  nextStatus: TaskPatchStatus,
): boolean =>
  currentStatus !== 'DONE' && TASK_PATCH_STATUSES.includes(nextStatus);

export const statusAfterCompletion = (status: TaskStatus): TaskStatus =>
  status === 'DONE' ? status : 'DONE';

export const statusAfterReopen = (status: TaskStatus): TaskStatus =>
  status === 'DONE' ? 'TODO' : status;
