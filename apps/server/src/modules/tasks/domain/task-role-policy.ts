import type { WorkspaceRole } from '../../iam/domain/workspace-membership';

export const TASK_READ_ROLES: readonly WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
  'MEMBER',
  'GUEST',
];

export const TASK_WRITE_ROLES: readonly WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
  'MEMBER',
];

export const canReadTasks = (role: WorkspaceRole): boolean =>
  TASK_READ_ROLES.includes(role);

export const canWriteTasks = (role: WorkspaceRole): boolean =>
  TASK_WRITE_ROLES.includes(role);
