import type { Workspace } from '../../domain/workspace';
import type {
  WorkspaceMember,
  WorkspaceMembership,
  WorkspaceMembershipAccess,
  WorkspaceRole,
} from '../../domain/workspace-membership';

export const WORKSPACE_REPOSITORY = Symbol('WORKSPACE_REPOSITORY');

export interface CreateWorkspaceWithOwnerInput {
  workspace: Workspace;
  ownerMembership: WorkspaceMembership;
}

export interface CreateWorkspaceWithOwnerSuccess {
  type: 'created';
  workspace: Workspace;
  membership: WorkspaceMembership;
}

export type CreateWorkspaceWithOwnerResult =
  CreateWorkspaceWithOwnerSuccess | { type: 'slug_conflict' };

export interface UpdateWorkspaceInput {
  actorUserId: string;
  name?: string;
  slug?: string;
  settings?: Record<string, unknown>;
  updatedAt: Date;
}

export type UpdateWorkspaceResult =
  | { type: 'updated'; workspace: Workspace }
  | { type: 'not_found' }
  | { type: 'slug_conflict' };

export interface AddWorkspaceMemberInput {
  id: string;
  workspaceId: string;
  actorUserId: string;
  email: string;
  role: Exclude<WorkspaceRole, 'OWNER'>;
  createdAt: Date;
}

export type AddWorkspaceMemberResult =
  | { type: 'added'; member: WorkspaceMember }
  | { type: 'workspace_not_found' }
  | { type: 'forbidden' }
  | { type: 'user_not_found' }
  | { type: 'membership_conflict' };

export type SoftDeleteWorkspaceResult =
  { type: 'deleted' } | { type: 'workspace_not_found' } | { type: 'forbidden' };

export interface ChangeWorkspaceMemberRoleInput {
  workspaceId: string;
  membershipId: string;
  actorUserId: string;
  role: WorkspaceRole;
  updatedAt: Date;
}

export type ChangeWorkspaceMemberRoleResult =
  | { type: 'updated'; member: WorkspaceMember }
  | { type: 'workspace_not_found' }
  | { type: 'membership_not_found' }
  | { type: 'forbidden' }
  | { type: 'last_owner' };

export interface RemoveWorkspaceMemberInput {
  workspaceId: string;
  membershipId: string;
  actorUserId: string;
}

export type RemoveWorkspaceMemberResult =
  | { type: 'removed' }
  | { type: 'workspace_not_found' }
  | { type: 'membership_not_found' }
  | { type: 'forbidden' }
  | { type: 'last_owner' };

export interface WorkspaceRepository {
  createWorkspaceWithOwner(
    input: CreateWorkspaceWithOwnerInput,
  ): Promise<CreateWorkspaceWithOwnerResult>;
  findActiveWorkspaceMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembershipAccess | null>;
  listActiveWorkspacesForUser(userId: string): Promise<Workspace[]>;
  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  findWorkspaceMember(
    workspaceId: string,
    membershipId: string,
  ): Promise<WorkspaceMember | null>;
  updateWorkspace(
    workspaceId: string,
    input: UpdateWorkspaceInput,
  ): Promise<UpdateWorkspaceResult>;
  softDeleteWorkspace(
    workspaceId: string,
    actorUserId: string,
    deletedAt: Date,
  ): Promise<SoftDeleteWorkspaceResult>;
  addWorkspaceMemberByEmail(
    input: AddWorkspaceMemberInput,
  ): Promise<AddWorkspaceMemberResult>;
  changeWorkspaceMemberRole(
    input: ChangeWorkspaceMemberRoleInput,
  ): Promise<ChangeWorkspaceMemberRoleResult>;
  removeWorkspaceMember(
    input: RemoveWorkspaceMemberInput,
  ): Promise<RemoveWorkspaceMemberResult>;
}
