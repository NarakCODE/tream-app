import type { WorkspaceRole } from './workspace-membership';

export const canUpdateWorkspace = (role: WorkspaceRole): boolean =>
  role === 'OWNER' || role === 'ADMIN';

export const canDeleteWorkspace = (role: WorkspaceRole): boolean =>
  role === 'OWNER';

export const canAddMembers = canUpdateWorkspace;

export const canManageMember = (
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  nextRole?: WorkspaceRole,
): boolean => {
  if (actorRole === 'OWNER') {
    return true;
  }

  return (
    actorRole === 'ADMIN' &&
    (targetRole === 'MEMBER' || targetRole === 'GUEST') &&
    nextRole !== 'OWNER'
  );
};

export const canAssignRole = (
  actorRole: WorkspaceRole,
  role: WorkspaceRole,
): boolean =>
  actorRole === 'OWNER' || (actorRole === 'ADMIN' && role !== 'OWNER');
