import { Inject, Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { ulid } from 'ulid';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import { ResourceConflictException } from '../../../common/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import type { Workspace } from '../domain/workspace';
import type {
  WorkspaceMember,
  WorkspaceRole,
} from '../domain/workspace-membership';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from './ports/workspace-repository.port';

export interface CreateWorkspaceInput {
  name: string;
  slug: string;
}

export interface UpdateWorkspaceDetailsInput {
  name?: string;
  slug?: string;
  settings?: Record<string, unknown>;
}

export interface AddWorkspaceMemberInput {
  email: string;
  role: Exclude<WorkspaceRole, 'OWNER'>;
}

@Injectable()
export class WorkspaceService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly repository: WorkspaceRepository,
  ) {}

  async create(
    userId: string,
    input: CreateWorkspaceInput,
  ): Promise<Workspace> {
    const now = new Date();
    const workspaceId = `ws_${ulid()}`;
    const result = await this.repository.createWorkspaceWithOwner({
      workspace: {
        id: workspaceId,
        name: input.name,
        slug: input.slug,
        settings: {},
        createdAt: now,
        updatedAt: now,
      },
      ownerMembership: {
        id: `mbr_${ulid()}`,
        workspaceId,
        userId,
        role: 'OWNER',
        createdAt: now,
        updatedAt: now,
      },
    });

    if (result.type === 'slug_conflict') {
      throw new ResourceConflictException(
        'This workspace slug is already in use.',
        { field: 'slug' },
      );
    }
    return result.workspace;
  }

  async update(
    workspaceId: string,
    actorUserId: string,
    input: UpdateWorkspaceDetailsInput,
  ): Promise<Workspace> {
    const result = await this.repository.updateWorkspace(workspaceId, {
      ...input,
      actorUserId,
      updatedAt: new Date(),
    });
    if (result.type === 'updated') {
      return result.workspace;
    }
    if (result.type === 'slug_conflict') {
      throw new ResourceConflictException(
        'This workspace slug is already in use.',
        { field: 'slug' },
      );
    }
    throw this.workspaceForbidden();
  }

  async listForUser(userId: string): Promise<Workspace[]> {
    return this.repository.listActiveWorkspacesForUser(userId);
  }

  async delete(workspaceId: string, actorUserId: string): Promise<void> {
    const result = await this.repository.softDeleteWorkspace(
      workspaceId,
      actorUserId,
      new Date(),
    );
    if (result.type !== 'deleted') {
      throw this.workspaceForbidden();
    }
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.repository.listWorkspaceMembers(workspaceId);
  }

  async findMember(
    workspaceId: string,
    membershipId: string,
  ): Promise<WorkspaceMember> {
    const member = await this.repository.findWorkspaceMember(
      workspaceId,
      membershipId,
    );
    if (member === null) {
      throw new ResourceNotFoundException('Membership', membershipId);
    }
    return member;
  }

  async addMember(
    workspaceId: string,
    actorUserId: string,
    input: AddWorkspaceMemberInput,
  ): Promise<WorkspaceMember> {
    const result = await this.repository.addWorkspaceMemberByEmail({
      id: `mbr_${ulid()}`,
      workspaceId,
      actorUserId,
      email: input.email,
      role: input.role,
      createdAt: new Date(),
    });
    switch (result.type) {
      case 'added':
        return result.member;
      case 'membership_conflict':
        throw new ResourceConflictException(
          'This user is already a workspace member.',
          { field: 'email' },
        );
      case 'user_not_found':
        throw new ResourceNotFoundException('User', input.email);
      case 'workspace_not_found':
      case 'forbidden':
        throw this.workspaceForbidden();
    }
  }

  async changeMemberRole(
    workspaceId: string,
    membershipId: string,
    actorUserId: string,
    role: WorkspaceRole,
  ): Promise<WorkspaceMember> {
    const result = await this.repository.changeWorkspaceMemberRole({
      workspaceId,
      membershipId,
      actorUserId,
      role,
      updatedAt: new Date(),
    });
    switch (result.type) {
      case 'updated':
        return result.member;
      case 'last_owner':
        throw new ResourceConflictException(
          'A workspace must retain at least one owner.',
        );
      case 'membership_not_found':
        throw new ResourceNotFoundException('Membership', membershipId);
      case 'workspace_not_found':
      case 'forbidden':
        throw this.memberForbidden();
    }
  }

  async removeMember(
    workspaceId: string,
    membershipId: string,
    actorUserId: string,
  ): Promise<void> {
    const result = await this.repository.removeWorkspaceMember({
      workspaceId,
      membershipId,
      actorUserId,
    });
    switch (result.type) {
      case 'removed':
        return;
      case 'last_owner':
        throw new ResourceConflictException(
          'A workspace must retain at least one owner.',
        );
      case 'membership_not_found':
        throw new ResourceNotFoundException('Membership', membershipId);
      case 'workspace_not_found':
      case 'forbidden':
        throw this.memberForbidden();
    }
  }

  private workspaceForbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this workspace.',
      HttpStatus.FORBIDDEN,
    );
  }

  private memberForbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have permission to manage this workspace member.',
      HttpStatus.FORBIDDEN,
    );
  }
}
