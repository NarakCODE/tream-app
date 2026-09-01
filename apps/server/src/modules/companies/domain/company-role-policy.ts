import type { WorkspaceRole } from '../../iam/domain/workspace-membership';

export const COMPANY_READ_ROLES: readonly WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
  'MEMBER',
  'GUEST',
];

export const COMPANY_WRITE_ROLES: readonly WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
  'MEMBER',
];

export const canReadCompanies = (role: WorkspaceRole): boolean =>
  COMPANY_READ_ROLES.includes(role);

export const canWriteCompanies = (role: WorkspaceRole): boolean =>
  COMPANY_WRITE_ROLES.includes(role);
