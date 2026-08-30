import type {
  AddWorkspaceMemberInput,
  AddWorkspaceMemberResult,
  ChangeWorkspaceMemberRoleInput,
  ChangeWorkspaceMemberRoleResult,
  CreateWorkspaceWithOwnerInput,
  CreateWorkspaceWithOwnerResult,
  RemoveWorkspaceMemberInput,
  RemoveWorkspaceMemberResult,
  UpdateWorkspaceInput,
  UpdateWorkspaceResult,
  WorkspaceRepository,
} from '../../src/modules/iam/application/ports/workspace-repository.port';
import type { Workspace } from '../../src/modules/iam/domain/workspace';
import type {
  WorkspaceMember,
  WorkspaceMembership,
  WorkspaceMembershipAccess,
} from '../../src/modules/iam/domain/workspace-membership';
import {
  canAddMembers,
  canAssignRole,
  canDeleteWorkspace,
  canManageMember,
  canUpdateWorkspace,
} from '../../src/modules/iam/domain/workspace-role-policy';
import type { InMemoryAuthRepository } from './in-memory-auth.repository';

interface StoredWorkspace extends Workspace {
  deletedAt: Date | null;
}

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private readonly workspaces = new Map<string, StoredWorkspace>();
  private readonly memberships = new Map<string, WorkspaceMembership>();

  constructor(private readonly authRepository: InMemoryAuthRepository) {}

  reset(): void {
    this.workspaces.clear();
    this.memberships.clear();
  }

  createWorkspaceWithOwner(
    input: CreateWorkspaceWithOwnerInput,
  ): Promise<CreateWorkspaceWithOwnerResult> {
    if (this.findBySlug(input.workspace.slug) !== null) {
      return Promise.resolve({ type: 'slug_conflict' });
    }
    this.workspaces.set(input.workspace.id, {
      ...input.workspace,
      deletedAt: null,
    });
    this.memberships.set(input.ownerMembership.id, input.ownerMembership);
    return Promise.resolve({
      type: 'created',
      workspace: input.workspace,
      membership: input.ownerMembership,
    });
  }

  findActiveWorkspaceMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembershipAccess | null> {
    const workspace = this.activeWorkspace(workspaceId);
    const membership = this.membersFor(workspaceId).find(
      (candidate) => candidate.userId === userId,
    );
    return Promise.resolve(
      workspace === null || membership === undefined
        ? null
        : { workspace, membership },
    );
  }

  listActiveWorkspacesForUser(userId: string): Promise<Workspace[]> {
    return Promise.resolve(
      this.membersForUser(userId)
        .map((membership) => this.activeWorkspace(membership.workspaceId))
        .filter(
          (workspace): workspace is StoredWorkspace => workspace !== null,
        ),
    );
  }

  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return Promise.resolve(
      this.membersFor(workspaceId)
        .map((membership) => this.toMember(membership))
        .filter((member): member is WorkspaceMember => member !== null),
    );
  }

  findWorkspaceMember(
    workspaceId: string,
    membershipId: string,
  ): Promise<WorkspaceMember | null> {
    const membership = this.memberships.get(membershipId);
    return Promise.resolve(
      membership?.workspaceId === workspaceId
        ? this.toMember(membership)
        : null,
    );
  }

  updateWorkspace(
    workspaceId: string,
    input: UpdateWorkspaceInput,
  ): Promise<UpdateWorkspaceResult> {
    const workspace = this.activeWorkspace(workspaceId);
    if (workspace === null) {
      return Promise.resolve({ type: 'not_found' });
    }
    const actor = this.membersFor(workspaceId).find(
      (membership) => membership.userId === input.actorUserId,
    );
    if (actor === undefined || !canUpdateWorkspace(actor.role)) {
      return Promise.resolve({ type: 'not_found' });
    }
    if (
      input.slug !== undefined &&
      [...this.workspaces.values()].some(
        (candidate) =>
          candidate.id !== workspaceId && candidate.slug === input.slug,
      )
    ) {
      return Promise.resolve({ type: 'slug_conflict' });
    }
    const changes = {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.slug === undefined ? {} : { slug: input.slug }),
      ...(input.settings === undefined ? {} : { settings: input.settings }),
      updatedAt: input.updatedAt,
    };
    const updated = { ...workspace, ...changes };
    this.workspaces.set(workspaceId, updated);
    return Promise.resolve({ type: 'updated', workspace: updated });
  }

  softDeleteWorkspace(
    workspaceId: string,
    actorUserId: string,
    deletedAt: Date,
  ): ReturnType<WorkspaceRepository['softDeleteWorkspace']> {
    const workspace = this.activeWorkspace(workspaceId);
    if (workspace === null) {
      return Promise.resolve({ type: 'workspace_not_found' });
    }
    const actor = this.membersFor(workspaceId).find(
      (membership) => membership.userId === actorUserId,
    );
    if (actor === undefined || !canDeleteWorkspace(actor.role)) {
      return Promise.resolve({ type: 'forbidden' });
    }
    this.workspaces.set(workspaceId, {
      ...workspace,
      deletedAt,
      updatedAt: deletedAt,
    });
    return Promise.resolve({ type: 'deleted' });
  }

  async addWorkspaceMemberByEmail(
    input: AddWorkspaceMemberInput,
  ): Promise<AddWorkspaceMemberResult> {
    if (this.activeWorkspace(input.workspaceId) === null) {
      return { type: 'workspace_not_found' };
    }
    const actor = this.membersFor(input.workspaceId).find(
      (membership) => membership.userId === input.actorUserId,
    );
    if (
      actor === undefined ||
      !canAddMembers(actor.role) ||
      !canAssignRole(actor.role, input.role)
    ) {
      return { type: 'forbidden' };
    }
    const user = await this.authRepository.findUserByEmail(input.email);
    if (user === null) {
      return { type: 'user_not_found' };
    }
    if (
      this.membersFor(input.workspaceId).some(
        (membership) => membership.userId === user.id,
      )
    ) {
      return { type: 'membership_conflict' };
    }
    const membership: WorkspaceMembership = {
      id: input.id,
      workspaceId: input.workspaceId,
      userId: user.id,
      role: input.role,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.memberships.set(membership.id, membership);
    const member = this.toMember(membership);
    if (member === null) {
      throw new Error('The in-memory membership user was not found.');
    }
    return { type: 'added', member };
  }

  changeWorkspaceMemberRole(
    input: ChangeWorkspaceMemberRoleInput,
  ): Promise<ChangeWorkspaceMemberRoleResult> {
    if (this.activeWorkspace(input.workspaceId) === null) {
      return Promise.resolve({ type: 'workspace_not_found' });
    }
    const actor = this.membersFor(input.workspaceId).find(
      (membership) => membership.userId === input.actorUserId,
    );
    const target = this.memberships.get(input.membershipId);
    if (target?.workspaceId !== input.workspaceId) {
      return Promise.resolve({ type: 'membership_not_found' });
    }
    if (
      actor === undefined ||
      !canManageMember(actor.role, target.role, input.role) ||
      !canAssignRole(actor.role, input.role)
    ) {
      return Promise.resolve({ type: 'forbidden' });
    }
    if (
      target.role === 'OWNER' &&
      input.role !== 'OWNER' &&
      this.ownerCount(input.workspaceId) === 1
    ) {
      return Promise.resolve({ type: 'last_owner' });
    }
    const updated = { ...target, role: input.role, updatedAt: input.updatedAt };
    this.memberships.set(target.id, updated);
    const member = this.toMember(updated);
    if (member === null) {
      throw new Error('The in-memory membership user was not found.');
    }
    return Promise.resolve({ type: 'updated', member });
  }

  removeWorkspaceMember(
    input: RemoveWorkspaceMemberInput,
  ): Promise<RemoveWorkspaceMemberResult> {
    if (this.activeWorkspace(input.workspaceId) === null) {
      return Promise.resolve({ type: 'workspace_not_found' });
    }
    const actor = this.membersFor(input.workspaceId).find(
      (membership) => membership.userId === input.actorUserId,
    );
    const target = this.memberships.get(input.membershipId);
    if (target?.workspaceId !== input.workspaceId) {
      return Promise.resolve({ type: 'membership_not_found' });
    }
    if (actor === undefined || !canManageMember(actor.role, target.role)) {
      return Promise.resolve({ type: 'forbidden' });
    }
    if (target.role === 'OWNER' && this.ownerCount(input.workspaceId) === 1) {
      return Promise.resolve({ type: 'last_owner' });
    }
    this.memberships.delete(target.id);
    return Promise.resolve({ type: 'removed' });
  }

  private activeWorkspace(workspaceId: string): StoredWorkspace | null {
    const workspace = this.workspaces.get(workspaceId);
    return workspace?.deletedAt === null ? workspace : null;
  }

  private findBySlug(slug: string): StoredWorkspace | null {
    return (
      [...this.workspaces.values()].find(
        (workspace) => workspace.slug === slug,
      ) ?? null
    );
  }

  private membersFor(workspaceId: string): WorkspaceMembership[] {
    return [...this.memberships.values()].filter(
      (membership) => membership.workspaceId === workspaceId,
    );
  }

  private membersForUser(userId: string): WorkspaceMembership[] {
    return [...this.memberships.values()].filter(
      (membership) => membership.userId === userId,
    );
  }

  private ownerCount(workspaceId: string): number {
    return this.membersFor(workspaceId).filter(
      (membership) => membership.role === 'OWNER',
    ).length;
  }

  private toMember(membership: WorkspaceMembership): WorkspaceMember | null {
    const user = this.authRepository.peekUser(membership.userId);
    return user === null
      ? null
      : {
          ...membership,
          user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            avatarUrl: user.avatarUrl,
          },
        };
  }
}
