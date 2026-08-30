import type { Workspace } from './workspace';

export const WORKSPACE_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'GUEST'] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export interface WorkspaceMembership {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMember extends WorkspaceMembership {
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
  };
}

export interface WorkspaceMembershipAccess {
  membership: WorkspaceMembership;
  workspace: Workspace;
}
