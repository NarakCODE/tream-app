import type { CursorPaginatedResult } from '../../../../common/interfaces/api-response.interface';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../../database/database.service';
import type { DatabaseTransaction } from '../../../../database/transaction';
import { CommandBus } from '../../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput } from '../../../../common/idempotency/idempotency.types';
import { EventWriter } from '../../../eventing/application/event-writer.service';
import { AuditWriter } from '../../../audit/application/audit-writer.service';
import {
  decodeCursor,
  encodeCursor,
} from '../../../../common/pagination/cursor';
import { WorkspaceAuthorizationService } from './workspace-authorization.service';
import {
  WorkspaceRepository,
  type Invitation,
  type Workspace,
  type Membership,
  type Preferences,
} from './ports/workspace.repository';
import {
  canManageRole,
  retainsActiveOwner,
  type WorkspacePermission,
} from '../domain/permissions';
import type {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  UpdateMembershipDto,
  CreateInvitationDto,
} from '../presentation/dto/workspace.dto';
import { InvitationDeliveryService } from './invitation-delivery.service';
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export function publicInvitation(invitation: Invitation) {
  const { tokenHash: _tokenHash, ...publicFields } = invitation;
  void _tokenHash;
  return publicFields;
}
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly repository: WorkspaceRepository,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly commands: CommandBus,
    private readonly events: EventWriter,
    private readonly audit: AuditWriter,
    private readonly delivery: InvitationDeliveryService,
  ) {}
  private async fact(
    tx: DatabaseTransaction,
    workspaceId: string,
    actorId: string,
    eventType: string,
    targetType: string,
    targetId: string,
    payload: Record<string, unknown>,
  ) {
    await this.events.append(tx, {
      workspaceId,
      actorId,
      eventType,
      aggregateType: targetType,
      aggregateId: targetId,
      payload,
    });
    await this.audit.append(tx, {
      workspaceId,
      actorId,
      action: eventType,
      targetType,
      targetId,
    });
  }
  private command<T>(
    identity: IdempotencyReservationInput,
    workspaceId: string,
    permission: WorkspacePermission,
    handler: (tx: DatabaseTransaction) => Promise<T>,
    options: {
      archived?: boolean;
      deleted?: boolean;
      policy?: (tx: DatabaseTransaction) => Promise<void>;
    } = {},
  ) {
    return this.commands.execute(identity, handler, {
      authorize: async (tx) => {
        const { workspace, member } = await this.authorization.require(
          tx,
          identity.userId,
          workspaceId,
          permission,
          { lock: true, ...options },
        );
        if (workspace.deletedAt && options.deleted && member.role !== 'OWNER')
          throw new ForbiddenException('Only an owner can restore trash.');
        await options.policy?.(tx);
      },
    });
  }
  list(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<CursorPaginatedResult<Workspace>> {
    return this.db.db.transaction(async (tx) => {
      const rows = await this.repository.list(
        tx,
        userId,
        limit + 1,
        cursor ? decodeCursor(cursor) : undefined,
      );
      const items = rows.slice(0, limit);
      const total = await this.repository.countWorkspaces(tx, userId);
      return {
        paginationType: 'cursor',
        cursor: cursor ?? null,
        hasNext: rows.length > limit,
        limit,
        total,
        items,
        nextCursor:
          rows.length > limit ? encodeCursor(items[items.length - 1]!) : null,
      };
    });
  }
  get(userId: string, workspaceId: string) {
    return this.db.db.transaction(
      async (tx) =>
        (
          await this.authorization.require(
            tx,
            userId,
            workspaceId,
            'workspace.read',
          )
        ).workspace,
    );
  }
  async create(identity: IdempotencyReservationInput, dto: CreateWorkspaceDto) {
    try {
      return await this.commands.execute(
        identity,
        async (tx) => {
          const id = randomUUID();
          const membershipId = randomUUID();
          const workspace = await this.repository.create(
            tx,
            { id, name: dto.name.trim(), slug: dto.slug },
            {
              id: membershipId,
              userId: identity.userId,
              workspaceId: id,
              role: 'OWNER',
              state: 'ACTIVE',
            },
          );
          await this.repository.select(tx, identity.userId, id);
          await this.fact(
            tx,
            id,
            membershipId,
            'workspace.created',
            'workspace',
            id,
            { workspace_id: id, owner_membership_id: membershipId },
          );
          return workspace;
        },
        { statusCode: 201 },
      );
    } catch (error) {
      let cause: unknown = error;
      const seen = new Set<unknown>();
      while (cause && typeof cause === 'object' && !seen.has(cause)) {
        seen.add(cause);
        const detail = cause as {
          code?: string;
          constraint?: string;
          cause?: unknown;
        };
        if (
          detail.code === '23505' &&
          detail.constraint === 'workspaces_slug_idx'
        ) {
          throw new ConflictException(
            'This workspace slug is already taken. Choose a different slug.',
          );
        }
        cause = detail.cause;
      }
      throw error;
    }
  }
  update(
    identity: IdempotencyReservationInput,
    workspaceId: string,
    dto: UpdateWorkspaceDto,
  ) {
    return this.command(
      identity,
      workspaceId,
      'workspace.update',
      async (tx) => {
        const { workspace, member } = await this.authorization.require(
          tx,
          identity.userId,
          workspaceId,
          'workspace.update',
          { archived: true, deleted: true },
        );
        if (
          workspace.deletedAt &&
          workspace.deletedAt.getTime() < Date.now() - 30 * 86400000
        )
          throw new ConflictException('Workspace trash retention expired.');
        if (workspace.deletedAt && member.role !== 'OWNER')
          throw new ForbiddenException('Only an owner can restore trash.');
        if (workspace.deletedAt && dto.lifecycle !== 'restore')
          throw new ForbiddenException('Workspace is deleted.');
        const result = await this.repository.update(tx, workspaceId, {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.lifecycle === 'archive' ? { archivedAt: new Date() } : {}),
          ...(dto.lifecycle === 'restore'
            ? { archivedAt: null, deletedAt: null }
            : {}),
        });
        await this.fact(
          tx,
          workspaceId,
          member.id,
          'workspace.updated',
          'workspace',
          workspaceId,
          { workspace_id: workspaceId },
        );
        return result;
      },
      { archived: true, deleted: true },
    );
  }
  remove(identity: IdempotencyReservationInput, workspaceId: string) {
    return this.command(
      identity,
      workspaceId,
      'workspace.delete',
      async (tx) => {
        const { member } = await this.authorization.require(
          tx,
          identity.userId,
          workspaceId,
          'workspace.delete',
          { archived: true },
        );
        await this.repository.update(tx, workspaceId, {
          archivedAt: null,
          deletedAt: new Date(),
        });
        await this.fact(
          tx,
          workspaceId,
          member.id,
          'workspace.deleted',
          'workspace',
          workspaceId,
          { workspace_id: workspaceId },
        );
        return { id: workspaceId, deleted: true };
      },
      { archived: true },
    );
  }
  members(
    userId: string,
    workspaceId: string,
    limit: number,
    cursor?: string,
  ): Promise<CursorPaginatedResult<Membership>> {
    return this.db.db.transaction(async (tx) => {
      await this.authorization.require(
        tx,
        userId,
        workspaceId,
        'membership.read',
      );
      const tuple = cursor ? decodeCursor(cursor) : undefined;
      const rows = await this.repository.members(
        tx,
        workspaceId,
        limit + 1,
        tuple,
      );
      const items = rows.slice(0, limit);
      const total = await this.repository.countMembers(tx, workspaceId);
      return {
        paginationType: 'cursor',
        cursor: cursor ?? null,
        hasNext: rows.length > limit,
        limit,
        total,
        items,
        nextCursor:
          rows.length > limit ? encodeCursor(items[items.length - 1]!) : null,
      };
    });
  }
  changeMember(
    identity: IdempotencyReservationInput,
    workspaceId: string,
    membershipId: string,
    dto: UpdateMembershipDto,
  ) {
    return this.command(
      identity,
      workspaceId,
      'membership.change_role',
      async (tx) => {
        const { member: actor } = await this.authorization.require(
          tx,
          identity.userId,
          workspaceId,
          'membership.change_role',
        );
        const members = await this.repository.members(tx, workspaceId);
        const target = members.find((row) => row.id === membershipId);
        if (!target) throw new NotFoundException('Membership not found.');
        const role = dto.role ?? target.role;
        const state = dto.state ?? target.state;
        if (!canManageRole(actor.role, target.role, role))
          throw new ForbiddenException(
            'Privileged membership requires an owner.',
          );
        if (!retainsActiveOwner(members, target.id, role, state))
          throw new ConflictException('Workspace requires an active owner.');
        const result = await this.repository.saveMember(tx, {
          ...target,
          role,
          state,
        });
        await this.fact(
          tx,
          workspaceId,
          actor.id,
          state === 'LEFT' ? 'membership.left' : 'membership.updated',
          'membership',
          result.id,
          { workspace_id: workspaceId, membership_id: result.id, role },
        );
        return result;
      },
      {
        policy: async (tx) => {
          const { member } = await this.authorization.require(
            tx,
            identity.userId,
            workspaceId,
            'membership.change_role',
          );
          const target = (await this.repository.members(tx, workspaceId)).find(
            (row) => row.id === membershipId,
          );
          if (!target) throw new NotFoundException('Membership not found.');
          if (!canManageRole(member.role, target.role, dto.role ?? target.role))
            throw new ForbiddenException(
              'Privileged membership requires an owner.',
            );
        },
      },
    );
  }
  invite(
    identity: IdempotencyReservationInput,
    workspaceId: string,
    dto: CreateInvitationDto,
  ) {
    return this.command(
      identity,
      workspaceId,
      'membership.invite',
      async (tx) => {
        const { member } = await this.authorization.require(
          tx,
          identity.userId,
          workspaceId,
          'membership.invite',
        );
        if (!canManageRole(member.role, 'MEMBER', dto.role))
          throw new ForbiddenException(
            'Privileged invitations require an owner.',
          );
        const now = new Date();
        const email = dto.email.trim().toLowerCase();
        await this.repository.expireInvitations(tx, workspaceId, email, now);
        const token = randomBytes(32).toString('base64url');
        const invitation = await this.repository.saveInvitation(tx, {
          id: randomUUID(),
          workspaceId,
          email,
          role: dto.role,
          tokenHash: hashToken(token),
          invitedBy: member.id,
          expiresAt: new Date(now.getTime() + 7 * 86400000),
        });
        await this.delivery.enqueue(tx, invitation, token);
        await this.fact(
          tx,
          workspaceId,
          member.id,
          'invitation.created',
          'invitation',
          invitation.id,
          {
            workspace_id: workspaceId,
            invitation_id: invitation.id,
            role: invitation.role,
          },
        );
        return publicInvitation(invitation);
      },
      {
        policy: async (tx) => {
          const { member } = await this.authorization.require(
            tx,
            identity.userId,
            workspaceId,
            'membership.invite',
          );
          if (!canManageRole(member.role, 'MEMBER', dto.role))
            throw new ForbiddenException(
              'Privileged invitations require an owner.',
            );
        },
      },
    );
  }
  invitations(
    userId: string,
    workspaceId: string,
    limit: number,
    cursor?: string,
  ): Promise<CursorPaginatedResult<ReturnType<typeof publicInvitation>>> {
    return this.db.db.transaction(async (tx) => {
      await this.authorization.require(
        tx,
        userId,
        workspaceId,
        'membership.invite',
      );
      const tuple = cursor ? decodeCursor(cursor) : undefined;
      const rows = await this.repository.invitations(
        tx,
        workspaceId,
        limit + 1,
        tuple,
      );
      const items = rows.slice(0, limit).map(publicInvitation);
      const total = await this.repository.countInvitations(tx, workspaceId);
      return {
        paginationType: 'cursor',
        cursor: cursor ?? null,
        hasNext: rows.length > limit,
        limit,
        total,
        items,
        nextCursor:
          rows.length > limit ? encodeCursor(items[items.length - 1]!) : null,
      };
    });
  }
  revokeInvitation(
    identity: IdempotencyReservationInput,
    workspaceId: string,
    id: string,
  ) {
    return this.command(
      identity,
      workspaceId,
      'membership.invite',
      async (tx) => {
        const { member } = await this.authorization.require(
          tx,
          identity.userId,
          workspaceId,
          'membership.invite',
        );
        const invitation = await this.repository.invitation(
          tx,
          workspaceId,
          id,
        );
        if (!invitation) throw new NotFoundException('Invitation not found.');
        if (!canManageRole(member.role, 'MEMBER', invitation.role))
          throw new ForbiddenException(
            'Privileged invitation requires an owner.',
          );
        if (invitation.acceptedAt)
          throw new ConflictException('Invitation already accepted.');
        const result = await this.repository.updateInvitation(tx, id, {
          revokedAt: new Date(),
        });
        await this.fact(
          tx,
          workspaceId,
          member.id,
          'invitation.revoked',
          'invitation',
          id,
          { workspace_id: workspaceId, invitation_id: id },
        );
        return publicInvitation(result);
      },
      {
        policy: async (tx) => {
          const { member } = await this.authorization.require(
            tx,
            identity.userId,
            workspaceId,
            'membership.invite',
          );
          const invitation = await this.repository.invitation(
            tx,
            workspaceId,
            id,
          );
          if (!invitation) throw new NotFoundException('Invitation not found.');
          if (!canManageRole(member.role, 'MEMBER', invitation.role))
            throw new ForbiddenException(
              'Privileged invitation requires an owner.',
            );
        },
      },
    );
  }
  accept(identity: IdempotencyReservationInput, token: string) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const invitation = await this.repository.invitationByHash(
          tx,
          hashToken(token),
        );
        if (!invitation) throw new NotFoundException('Invitation not found.');
        const workspace = await this.repository.workspace(
          tx,
          invitation.workspaceId,
          true,
        );
        const current = await this.repository.invitation(
          tx,
          invitation.workspaceId,
          invitation.id,
        );
        const user = await this.repository.user(tx, identity.userId);
        if (
          !workspace ||
          workspace.deletedAt ||
          workspace.archivedAt ||
          !current ||
          current.acceptedAt ||
          current.revokedAt ||
          current.expiresAt <= new Date()
        )
          throw new ConflictException('Invitation unavailable.');
        if (
          !user?.emailVerifiedAt ||
          user.email.toLowerCase() !== current.email
        )
          throw new ForbiddenException('Verified invitation email required.');
        const inviter = await this.repository.membership(
          tx,
          current.workspaceId,
          (await this.repository.members(tx, current.workspaceId)).find(
            (m) => m.id === current.invitedBy,
          )?.userId ?? '',
        );
        if (
          !inviter ||
          inviter.state !== 'ACTIVE' ||
          !canManageRole(inviter.role, 'MEMBER', current.role)
        )
          throw new ForbiddenException(
            'Invitation issuer no longer authorized.',
          );
        const existing = await this.repository.membership(
          tx,
          current.workspaceId,
          identity.userId,
        );
        if (existing && existing.state !== 'LEFT')
          throw new ConflictException('Membership already exists.');
        const member = await this.repository.saveMember(tx, {
          id: existing?.id ?? randomUUID(),
          workspaceId: current.workspaceId,
          userId: identity.userId,
          role: current.role,
          state: 'ACTIVE',
        });
        await this.repository.updateInvitation(tx, current.id, {
          acceptedAt: new Date(),
          acceptedBy: member.id,
        });
        await this.fact(
          tx,
          current.workspaceId,
          member.id,
          'invitation.accepted',
          'invitation',
          current.id,
          { workspace_id: current.workspaceId, invitation_id: current.id },
        );
        await this.fact(
          tx,
          current.workspaceId,
          member.id,
          'membership.created',
          'membership',
          member.id,
          {
            workspace_id: current.workspaceId,
            membership_id: member.id,
            role: member.role,
          },
        );
        return member;
      },
      {
        authorize: async (tx) => {
          const invitation = await this.repository.invitationByHash(
            tx,
            hashToken(token),
          );
          const user = await this.repository.user(tx, identity.userId);
          if (
            !invitation ||
            !user?.emailVerifiedAt ||
            user.email.toLowerCase() !== invitation.email
          )
            throw new ForbiddenException('Verified invitation email required.');
          const workspace = await this.repository.workspace(
            tx,
            invitation.workspaceId,
            true,
          );
          if (!workspace || workspace.deletedAt || workspace.archivedAt)
            throw new NotFoundException('Workspace not found.');
          if (invitation.acceptedAt) {
            const current = await this.repository.membership(
              tx,
              invitation.workspaceId,
              identity.userId,
            );
            if (!current || current.state !== 'ACTIVE')
              throw new ForbiddenException('Membership no longer active.');
          }
        },
      },
    );
  }
  preferences(userId: string, workspaceId: string) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.authorization.require(
        tx,
        userId,
        workspaceId,
        'preferences.update',
      );
      return (
        (await this.repository.preference(tx, member.id)) ?? {
          theme: 'system',
          timezone: 'UTC',
        }
      );
    });
  }
  savePreferences(
    identity: IdempotencyReservationInput,
    workspaceId: string,
    preferences: Preferences,
  ) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: preferences.timezone });
    } catch {
      throw new BadRequestException('Invalid timezone.');
    }
    return this.command(
      identity,
      workspaceId,
      'preferences.update',
      async (tx) => {
        const { member } = await this.authorization.require(
          tx,
          identity.userId,
          workspaceId,
          'preferences.update',
        );
        await this.repository.savePreference(tx, member.id, preferences);
        await this.fact(
          tx,
          workspaceId,
          member.id,
          'workspace.preference_updated',
          'membership',
          member.id,
          { workspace_id: workspaceId, membership_id: member.id },
        );
        return preferences;
      },
    );
  }
  active(userId: string) {
    return this.db.db.transaction(async (tx) => {
      const workspaceId = await this.repository.selection(tx, userId);
      if (!workspaceId) return null;
      const workspace = await this.repository.workspace(tx, workspaceId);
      const member = await this.repository.membership(tx, workspaceId, userId);
      return workspace &&
        !workspace.deletedAt &&
        !workspace.archivedAt &&
        member?.state === 'ACTIVE'
        ? { workspaceId, workspace, membership: member }
        : null;
    });
  }
  leave(identity: IdempotencyReservationInput, workspaceId: string) {
    return this.command(identity, workspaceId, 'workspace.read', async (tx) => {
      const { member } = await this.authorization.require(
        tx,
        identity.userId,
        workspaceId,
        'workspace.read',
      );
      const members = await this.repository.members(tx, workspaceId);
      if (!retainsActiveOwner(members, member.id, member.role, 'LEFT'))
        throw new ConflictException('Workspace requires an active owner.');
      const result = await this.repository.saveMember(tx, {
        ...member,
        state: 'LEFT',
      });
      await this.fact(
        tx,
        workspaceId,
        member.id,
        'membership.left',
        'membership',
        member.id,
        {
          workspace_id: workspaceId,
          membership_id: member.id,
          role: member.role,
        },
      );
      return result;
    });
  }
  select(identity: IdempotencyReservationInput, workspaceId: string) {
    return this.command(identity, workspaceId, 'workspace.read', async (tx) => {
      await this.repository.select(tx, identity.userId, workspaceId);
      const { member } = await this.authorization.require(
        tx,
        identity.userId,
        workspaceId,
        'workspace.read',
      );
      await this.fact(
        tx,
        workspaceId,
        member.id,
        'workspace.preference_updated',
        'membership',
        member.id,
        { workspace_id: workspaceId, membership_id: member.id },
      );
      return { workspaceId };
    });
  }
}
