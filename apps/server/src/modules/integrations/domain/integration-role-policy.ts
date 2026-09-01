import type { WorkspaceRole } from '../../iam/domain/workspace-membership';

export const INTEGRATION_READ_ROLES: readonly WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
  'MEMBER',
  'GUEST',
];

export const INTEGRATION_WRITE_ROLES: readonly WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
];

export const canReadIntegrations = (role: WorkspaceRole): boolean =>
  INTEGRATION_READ_ROLES.includes(role);

export const canWriteIntegrations = (role: WorkspaceRole): boolean =>
  INTEGRATION_WRITE_ROLES.includes(role);
