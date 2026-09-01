import type { WorkspaceRole } from '../../iam/domain/workspace-membership';

export const DEAL_READ_ROLES: readonly WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
  'MEMBER',
  'GUEST',
];

export const DEAL_WRITE_ROLES: readonly WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
  'MEMBER',
];

export const canReadDeals = (role: WorkspaceRole): boolean =>
  DEAL_READ_ROLES.includes(role);

export const canWriteDeals = (role: WorkspaceRole): boolean =>
  DEAL_WRITE_ROLES.includes(role);
