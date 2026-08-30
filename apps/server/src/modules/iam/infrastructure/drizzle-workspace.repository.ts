import { Injectable } from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import { memberships, users, workspaces } from '../../../database/schema';
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
} from '../application/ports/workspace-repository.port';
import type { Workspace } from '../domain/workspace';
import type {
  WorkspaceMember,
  WorkspaceMembership,
  WorkspaceMembershipAccess,
} from '../domain/workspace-membership';
import {
  canAddMembers,
  canAssignRole,
  canDeleteWorkspace,
  canManageMember,
  canUpdateWorkspace,
} from '../domain/workspace-role-policy';

const first = <T>(values: T[]): T | null => values[0] ?? null;

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === '23505';

const activeWorkspaceFilter = (workspaceId: string) =>
  and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt));

@Injectable()
export class DrizzleWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly database: DatabaseService) {}

  async createWorkspaceWithOwner(
    input: CreateWorkspaceWithOwnerInput,
  ): Promise<CreateWorkspaceWithOwnerResult> {
    try {
      return await this.database.db.transaction(async (transaction) => {
        const workspace = first(
          await transaction
            .insert(workspaces)
            .values(input.workspace)
            .returning(),
        );
        if (workspace === null) {
          throw new Error('The workspace insert returned no row.');
        }

        const membership = first(
          await transaction
            .insert(memberships)
            .values(input.ownerMembership)
            .returning(),
        );
        if (membership === null) {
          throw new Error('The owner membership insert returned no row.');
        }
        return { type: 'created', workspace, membership } as const;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { type: 'slug_conflict' };
      }
      throw error;
    }
  }

  async findActiveWorkspaceMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembershipAccess | null> {
    const row = first(
      await this.database.db
        .select({ workspace: workspaces, membership: memberships })
        .from(memberships)
        .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.userId, userId),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  }

  async listActiveWorkspacesForUser(userId: string): Promise<Workspace[]> {
    const rows = await this.database.db
      .select({ workspace: workspaces })
      .from(memberships)
      .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
      .where(and(eq(memberships.userId, userId), isNull(workspaces.deletedAt)))
      .orderBy(workspaces.createdAt);
    return rows.map(({ workspace }) => workspace);
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const rows = await this.database.db
      .select({ membership: memberships, user: users })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.workspaceId, workspaceId))
      .orderBy(memberships.createdAt);
    return rows.map(({ membership, user }) => this.toMember(membership, user));
  }

  async findWorkspaceMember(
    workspaceId: string,
    membershipId: string,
  ): Promise<WorkspaceMember | null> {
    const row = first(
      await this.database.db
        .select({ membership: memberships, user: users })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.id, membershipId),
          ),
        )
        .limit(1),
    );
    return row === null ? null : this.toMember(row.membership, row.user);
  }

  async updateWorkspace(
    workspaceId: string,
    input: UpdateWorkspaceInput,
  ): Promise<UpdateWorkspaceResult> {
    try {
      return await this.database.db.transaction(async (transaction) => {
        const workspace = first(
          await transaction
            .select({ id: workspaces.id })
            .from(workspaces)
            .where(activeWorkspaceFilter(workspaceId))
            .for('update')
            .limit(1),
        );
        if (workspace === null) {
          return { type: 'not_found' } as const;
        }

        const actor = first(
          await transaction
            .select({ role: memberships.role })
            .from(memberships)
            .where(
              and(
                eq(memberships.workspaceId, workspaceId),
                eq(memberships.userId, input.actorUserId),
              ),
            )
            .limit(1),
        );
        if (actor === null || !canUpdateWorkspace(actor.role)) {
          return { type: 'not_found' } as const;
        }

        const changes = {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.slug === undefined ? {} : { slug: input.slug }),
          ...(input.settings === undefined ? {} : { settings: input.settings }),
          updatedAt: input.updatedAt,
        };
        const updated = first(
          await transaction
            .update(workspaces)
            .set(changes)
            .where(activeWorkspaceFilter(workspaceId))
            .returning(),
        );
        return updated === null
          ? ({ type: 'not_found' } as const)
          : ({ type: 'updated', workspace: updated } as const);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { type: 'slug_conflict' };
      }
      throw error;
    }
  }

  async softDeleteWorkspace(
    workspaceId: string,
    actorUserId: string,
    deletedAt: Date,
  ): ReturnType<WorkspaceRepository['softDeleteWorkspace']> {
    return this.database.db.transaction(async (transaction) => {
      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(workspaceId))
          .for('update')
          .limit(1),
      );
      if (workspace === null) {
        return { type: 'workspace_not_found' } as const;
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, workspaceId),
              eq(memberships.userId, actorUserId),
            ),
          )
          .limit(1),
      );
      if (actor === null || !canDeleteWorkspace(actor.role)) {
        return { type: 'forbidden' } as const;
      }

      const deleted = await transaction
        .update(workspaces)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(activeWorkspaceFilter(workspaceId))
        .returning({ id: workspaces.id });
      return deleted.length === 0
        ? ({ type: 'workspace_not_found' } as const)
        : ({ type: 'deleted' } as const);
    });
  }

  async addWorkspaceMemberByEmail(
    input: AddWorkspaceMemberInput,
  ): Promise<AddWorkspaceMemberResult> {
    try {
      return await this.database.db.transaction(async (transaction) => {
        const workspace = first(
          await transaction
            .select({ id: workspaces.id })
            .from(workspaces)
            .where(activeWorkspaceFilter(input.workspaceId))
            .for('update')
            .limit(1),
        );
        if (workspace === null) {
          return { type: 'workspace_not_found' } as const;
        }

        const actor = first(
          await transaction
            .select({ role: memberships.role })
            .from(memberships)
            .where(
              and(
                eq(memberships.workspaceId, input.workspaceId),
                eq(memberships.userId, input.actorUserId),
              ),
            )
            .limit(1),
        );
        if (
          actor === null ||
          !canAddMembers(actor.role) ||
          !canAssignRole(actor.role, input.role)
        ) {
          return { type: 'forbidden' } as const;
        }

        const user = first(
          await transaction
            .select()
            .from(users)
            .where(eq(users.email, input.email))
            .limit(1),
        );
        if (user === null) {
          return { type: 'user_not_found' } as const;
        }

        const membership = first(
          await transaction
            .insert(memberships)
            .values({
              id: input.id,
              workspaceId: input.workspaceId,
              userId: user.id,
              role: input.role,
              createdAt: input.createdAt,
              updatedAt: input.createdAt,
            })
            .returning(),
        );
        if (membership === null) {
          throw new Error('The membership insert returned no row.');
        }
        return {
          type: 'added',
          member: this.toMember(membership, user),
        } as const;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { type: 'membership_conflict' };
      }
      throw error;
    }
  }

  async changeWorkspaceMemberRole(
    input: ChangeWorkspaceMemberRoleInput,
  ): Promise<ChangeWorkspaceMemberRoleResult> {
    return this.database.db.transaction(async (transaction) => {
      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(input.workspaceId))
          .for('update')
          .limit(1),
      );
      if (workspace === null) {
        return { type: 'workspace_not_found' } as const;
      }

      const actor = first(
        await transaction
          .select()
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, input.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      const target = first(
        await transaction
          .select({ membership: memberships, user: users })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(
            and(
              eq(memberships.workspaceId, input.workspaceId),
              eq(memberships.id, input.membershipId),
            ),
          )
          .limit(1),
      );
      if (target === null) {
        return { type: 'membership_not_found' } as const;
      }
      if (
        actor === null ||
        !canManageMember(actor.role, target.membership.role, input.role) ||
        !canAssignRole(actor.role, input.role)
      ) {
        return { type: 'forbidden' } as const;
      }

      if (target.membership.role === 'OWNER' && input.role !== 'OWNER') {
        const [{ owners = 0 } = {}] = await transaction
          .select({ owners: count() })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, input.workspaceId),
              eq(memberships.role, 'OWNER'),
            ),
          );
        if (owners <= 1) {
          return { type: 'last_owner' } as const;
        }
      }

      const membership = first(
        await transaction
          .update(memberships)
          .set({ role: input.role, updatedAt: input.updatedAt })
          .where(
            and(
              eq(memberships.workspaceId, input.workspaceId),
              eq(memberships.id, input.membershipId),
            ),
          )
          .returning(),
      );
      if (membership === null) {
        return { type: 'membership_not_found' } as const;
      }
      return {
        type: 'updated',
        member: this.toMember(membership, target.user),
      } as const;
    });
  }

  async removeWorkspaceMember(
    input: RemoveWorkspaceMemberInput,
  ): Promise<RemoveWorkspaceMemberResult> {
    return this.database.db.transaction(async (transaction) => {
      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(input.workspaceId))
          .for('update')
          .limit(1),
      );
      if (workspace === null) {
        return { type: 'workspace_not_found' } as const;
      }

      const actor = first(
        await transaction
          .select()
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, input.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      const target = first(
        await transaction
          .select()
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, input.workspaceId),
              eq(memberships.id, input.membershipId),
            ),
          )
          .limit(1),
      );
      if (target === null) {
        return { type: 'membership_not_found' } as const;
      }
      if (actor === null || !canManageMember(actor.role, target.role)) {
        return { type: 'forbidden' } as const;
      }

      if (target.role === 'OWNER') {
        const [{ owners = 0 } = {}] = await transaction
          .select({ owners: count() })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, input.workspaceId),
              eq(memberships.role, 'OWNER'),
            ),
          );
        if (owners <= 1) {
          return { type: 'last_owner' } as const;
        }
      }

      const removed = await transaction
        .delete(memberships)
        .where(
          and(
            eq(memberships.workspaceId, input.workspaceId),
            eq(memberships.id, input.membershipId),
          ),
        )
        .returning({ id: memberships.id });
      return removed.length === 0
        ? ({ type: 'membership_not_found' } as const)
        : ({ type: 'removed' } as const);
    });
  }

  private toMember(
    membership: WorkspaceMembership,
    user: typeof users.$inferSelect,
  ): WorkspaceMember {
    return {
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
