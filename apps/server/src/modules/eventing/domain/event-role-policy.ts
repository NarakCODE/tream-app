import type { WorkspaceRole } from '../../iam/domain/workspace-membership';

export const EVENT_READ_ROLES: readonly WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
  'MEMBER',
  'GUEST',
];

export const EVENT_REPROCESS_ROLES: readonly WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
];

export const canReadEvents = (role: WorkspaceRole): boolean =>
  EVENT_READ_ROLES.includes(role);

export const canReprocessEvents = (role: WorkspaceRole): boolean =>
  EVENT_REPROCESS_ROLES.includes(role);
