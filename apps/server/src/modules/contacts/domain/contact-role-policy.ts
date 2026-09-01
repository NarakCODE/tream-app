import type { WorkspaceRole } from '../../iam/domain/workspace-membership';

export const CONTACT_READ_ROLES: readonly WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
  'MEMBER',
  'GUEST',
];

export const CONTACT_WRITE_ROLES: readonly WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
  'MEMBER',
];

export const canReadContacts = (role: WorkspaceRole): boolean =>
  CONTACT_READ_ROLES.includes(role);

export const canWriteContacts = (role: WorkspaceRole): boolean =>
  CONTACT_WRITE_ROLES.includes(role);
