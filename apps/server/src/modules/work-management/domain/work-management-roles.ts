import type { WorkspaceRole } from '../../iam/domain/workspace-membership';

export const WORK_MANAGEMENT_READ_ROLES: readonly WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
  'MEMBER',
  'GUEST',
];

export const WORK_MANAGEMENT_WRITE_ROLES: readonly WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
  'MEMBER',
];

export const WORK_MANAGEMENT_ADMIN_ROLES: readonly WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
];

export const canReadWorkManagement = (role: WorkspaceRole): boolean =>
  WORK_MANAGEMENT_READ_ROLES.includes(role);

export const canWriteWorkManagement = (role: WorkspaceRole): boolean =>
  WORK_MANAGEMENT_WRITE_ROLES.includes(role);

export const canAdministerWorkManagement = (role: WorkspaceRole): boolean =>
  WORK_MANAGEMENT_ADMIN_ROLES.includes(role);

export const canJoinTeam = (role: WorkspaceRole): boolean =>
  role === 'OWNER' || role === 'ADMIN' || role === 'MEMBER';
