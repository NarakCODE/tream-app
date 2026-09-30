export const ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'GUEST'] as const;
export type WorkspaceRole = (typeof ROLES)[number];
export const STATES = ['ACTIVE', 'SUSPENDED', 'LEFT'] as const;
export type MembershipState = (typeof STATES)[number];
export const PERMISSIONS = [
  'audit.read',
  'workspace.read',
  'workspace.update',
  'workspace.delete',
  'membership.read',
  'membership.invite',
  'membership.change_role',
  'team.manage',
  'issue.read',
  'issue.update',
  'preferences.update',
] as const;
export type WorkspacePermission = (typeof PERMISSIONS)[number];
const administrative: WorkspacePermission[] = [
  'workspace.read',
  'workspace.update',
  'membership.read',
  'membership.invite',
  'membership.change_role',
  'team.manage',
  'issue.read',
  'issue.update',
  'preferences.update',
];
const matrix: Record<WorkspaceRole, readonly WorkspacePermission[]> = {
  OWNER: [...administrative, 'workspace.delete', 'audit.read'],
  ADMIN: administrative,
  MEMBER: [
    'workspace.read',
    'membership.read',
    'issue.read',
    'issue.update',
    'preferences.update',
  ],
  GUEST: ['workspace.read', 'preferences.update'],
};
export function hasPermission(
  role: WorkspaceRole,
  permission: WorkspacePermission,
): boolean {
  return matrix[role].includes(permission);
}
export function canManageRole(
  actor: WorkspaceRole,
  current: WorkspaceRole,
  desired: WorkspaceRole,
): boolean {
  return (
    actor === 'OWNER' ||
    (actor === 'ADMIN' &&
      !['OWNER', 'ADMIN'].includes(current) &&
      !['OWNER', 'ADMIN'].includes(desired))
  );
}
export function retainsActiveOwner(
  members: { id: string; role: WorkspaceRole; state: MembershipState }[],
  targetId: string,
  role: WorkspaceRole,
  state: MembershipState,
): boolean {
  return members.some((member) =>
    member.id === targetId
      ? role === 'OWNER' && state === 'ACTIVE'
      : member.role === 'OWNER' && member.state === 'ACTIVE',
  );
}
