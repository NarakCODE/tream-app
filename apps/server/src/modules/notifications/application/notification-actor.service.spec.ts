import { NotFoundException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { NotificationService } from './notification.service';
import { NotificationAccessService } from './notification-access.service';
import type { DatabaseService } from '../../../database/database.service';
import type { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { AuditWriter } from '../../audit/application/audit-writer.service';
import type { NotificationRepository } from '../infrastructure/notification.repository';
import type { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import type { IssueAccessService } from '../../issues/application/issue-access.service';
import type { ProjectAccessService } from '../../projects/application/project-access.service';
import type { InitiativeAccessService } from '../../initiatives/application/initiative-access.service';
import type { DocumentAccessService } from '../../documents/application/document-access.service';
import { memberships, users } from '../../../database/schema';

describe('notification actor display privacy', () => {
  function fixture() {
    const workspace = {
      require: jest.fn().mockResolvedValue({
        member: { id: 'recipient', role: 'GUEST' },
      }),
    };
    const access = new NotificationAccessService(
      workspace as unknown as WorkspaceAuthorizationService,
      {} as IssueAccessService,
      {} as ProjectAccessService,
      {} as InitiativeAccessService,
      {} as DocumentAccessService,
    );
    const source = jest.spyOn(access, 'source').mockResolvedValue(undefined);
    const notification = {
      id: 'notification',
      workspaceId: 'workspace',
      recipientMembershipId: 'recipient',
      actorMembershipId: 'actor',
    };
    const actor = { membershipId: 'actor', name: 'Alex Chen', avatarUrl: null };
    const notificationQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([notification]),
    };
    const actorQuery = {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([actor]),
    };
    const tx = {
      select: jest
        .fn()
        .mockReturnValueOnce(notificationQuery)
        .mockReturnValueOnce(actorQuery),
    };
    const service = new NotificationService(
      {
        db: {
          transaction: (run: (transaction: typeof tx) => unknown) => run(tx),
        },
      } as unknown as DatabaseService,
      {} as CommandBus,
      access,
      {} as NotificationRepository,
      {} as AuditWriter,
    );
    return {
      service,
      workspace,
      source,
      tx,
      notificationQuery,
      actorQuery,
      notification,
      actor,
    };
  }

  it('allows a guest recipient through workspace.read and validates source visibility', async () => {
    const f = fixture();
    await expect(
      f.service.actor('guest', 'workspace', 'notification'),
    ).resolves.toEqual(f.actor);
    expect(f.workspace.require).toHaveBeenCalledWith(
      f.tx,
      'guest',
      'workspace',
      'workspace.read',
      { lock: false },
    );
    expect(f.source).toHaveBeenCalledWith(f.tx, 'guest', f.notification, false);
  });

  it('does not query actor details when notification ownership fails', async () => {
    const f = fixture();
    f.notificationQuery.limit.mockResolvedValue([]);
    await expect(
      f.service.actor('other', 'workspace', 'notification'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.tx.select).toHaveBeenCalledTimes(1);
  });

  it('does not query actor details when the target is inaccessible', async () => {
    const f = fixture();
    f.source.mockRejectedValue(new NotFoundException());
    await expect(
      f.service.actor('guest', 'workspace', 'notification'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.tx.select).toHaveBeenCalledTimes(1);
  });

  it('projects only safe display fields and scopes active actors to the workspace', async () => {
    const f = fixture();
    await f.service.actor('guest', 'workspace', 'notification');
    expect(f.tx.select.mock.calls[1]).toEqual([
      {
        membershipId: memberships.id,
        name: users.fullName,
        avatarUrl: users.avatarUrl,
      },
    ]);
    const actorConditions = f.actorQuery.where.mock.calls as unknown as SQL[][];
    const condition = actorConditions[0]![0]!;
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.params).toEqual(['workspace', 'actor', 'ACTIVE']);
    expect(query.sql).toContain('"users"."disabled_at" is null');
    const ownershipConditions = f.notificationQuery.where.mock
      .calls as unknown as SQL[][];
    const ownership = new PgDialect().sqlToQuery(ownershipConditions[0]![0]!);
    expect(ownership.params).toEqual([
      'workspace',
      'notification',
      'recipient',
    ]);
  });

  it('returns null for a system actor without a lookup', async () => {
    const f = fixture();
    f.notification.actorMembershipId = null as unknown as string;
    await expect(
      f.service.actor('guest', 'workspace', 'notification'),
    ).resolves.toBeNull();
    expect(f.tx.select).toHaveBeenCalledTimes(1);
  });

  it('returns null when the active, non-disabled actor lookup has no match', async () => {
    const f = fixture();
    f.actorQuery.limit.mockResolvedValue([]);
    await expect(
      f.service.actor('guest', 'workspace', 'notification'),
    ).resolves.toBeNull();
  });
});
