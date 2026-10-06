import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  notifications,
  notificationPreferences,
  notificationDeliveryJobs,
  memberships,
  users,
} from '../../../database/schema';
import { DatabaseService } from '../../../database/database.service';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import { AuditWriter } from '../../audit/application/audit-writer.service';
import { NotificationAccessService } from './notification-access.service';
import { NotificationRepository } from '../infrastructure/notification.repository';
import type {
  NotificationListDto,
  NotificationPreferencesDto,
} from '../presentation/notification.dto';
@Injectable()
export class NotificationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly commands: CommandBus,
    private readonly access: NotificationAccessService,
    private readonly repo: NotificationRepository,
    private readonly audit: AuditWriter,
  ) {}
  list(userId: string, w: string, query: NotificationListDto) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.access.workspace.require(
        tx,
        userId,
        w,
        'workspace.read',
      );
      const pref = await this.repo.preference(tx, w, member.id);
      if (pref && !pref.inAppEnabled)
        return {
          paginationType: 'cursor',
          items: [],
          total: 0,
          limit: query.limit,
          cursor: query.cursor ?? null,
          nextCursor: null,
          hasNext: false,
        };
      return this.repo.list(tx, w, member.id, member.role === 'GUEST', query);
    });
  }
  unread(userId: string, w: string) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.access.workspace.require(
        tx,
        userId,
        w,
        'workspace.read',
      );
      const pref = await this.repo.preference(tx, w, member.id);
      if (pref && !pref.inAppEnabled) return { unreadCount: 0 };
      return this.repo.unread(tx, w, member.id, member.role === 'GUEST');
    });
  }
  get(userId: string, w: string, id: string) {
    return this.db.db.transaction(async (tx) => {
      const { row } = await this.access.owned(tx, userId, w, id);
      const { title, body, ...metadata } = row;
      void title;
      void body;
      return metadata;
    });
  }
  actor(userId: string, w: string, id: string) {
    return this.db.db.transaction(async (tx) => {
      const { row } = await this.access.owned(tx, userId, w, id);
      if (!row.actorMembershipId) return null;
      const [actor] = await tx
        .select({
          membershipId: memberships.id,
          name: users.fullName,
          avatarUrl: users.avatarUrl,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.workspaceId, w),
            eq(memberships.id, row.actorMembershipId),
            eq(memberships.state, 'ACTIVE'),
            isNull(users.disabledAt),
          ),
        )
        .limit(1);
      return actor ?? null;
    });
  }
  change(
    identity: Identity,
    w: string,
    id: string,
    expected: number,
    patch: Pick<
      Partial<typeof notifications.$inferInsert>,
      'readAt' | 'archivedAt' | 'snoozedUntil'
    >,
  ) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { row } = await this.access.owned(tx, identity.userId, w, id);
        if (row.revision !== expected)
          throw new ConflictException('Notification revision conflict.');
        const [updated] = await tx
          .update(notifications)
          .set({ ...patch, revision: row.revision + 1, updatedAt: new Date() })
          .where(eq(notifications.id, id))
          .returning();
        const { title, body, ...metadata } = updated!;
        void title;
        void body;
        return metadata;
      },
      {
        authorize: async (tx) => {
          await this.access.owned(tx, identity.userId, w, id, true);
        },
      },
    );
  }
  snooze(
    identity: Identity,
    w: string,
    id: string,
    expected: number,
    until: string | null,
  ) {
    let date: Date | null = null;
    if (until !== null) {
      date = new Date(until);
      if (date <= new Date() || date.getTime() > Date.now() + 90 * 86400000)
        throw new BadRequestException('Snooze must be in the next 90 days.');
    }
    return this.change(identity, w, id, expected, { snoozedUntil: date });
  }
  preferences(userId: string, w: string) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.access.workspace.require(
        tx,
        userId,
        w,
        'workspace.read',
      );
      return (
        (await this.repo.preference(tx, w, member.id)) ?? {
          workspaceId: w,
          recipientMembershipId: member.id,
          inAppEnabled: true,
          emailEnabled: false,
          revision: 0,
        }
      );
    });
  }
  updatePreferences(
    identity: Identity,
    w: string,
    dto: NotificationPreferencesDto,
  ) {
    if (dto.inAppEnabled === undefined && dto.emailEnabled === undefined)
      throw new BadRequestException(
        'At least one channel preference is required.',
      );
    return this.commands.execute(
      identity,
      async (tx) => {
        const { member } = await this.access.workspace.require(
          tx,
          identity.userId,
          w,
          'preferences.update',
        );
        const existing = await this.repo.preference(tx, w, member.id);
        if ((existing?.revision ?? 0) !== dto.expectedRevision)
          throw new ConflictException(
            'Notification preference revision conflict.',
          );
        const patch = {
          ...(dto.inAppEnabled !== undefined
            ? { inAppEnabled: dto.inAppEnabled }
            : {}),
          ...(dto.emailEnabled !== undefined
            ? { emailEnabled: dto.emailEnabled }
            : {}),
        };
        let row;
        if (existing)
          [row] = await tx
            .update(notificationPreferences)
            .set({
              ...patch,
              revision: existing.revision + 1,
              updatedAt: new Date(),
            })
            .where(eq(notificationPreferences.id, existing.id))
            .returning();
        else
          [row] = await tx
            .insert(notificationPreferences)
            .values({
              id: randomUUID(),
              workspaceId: w,
              recipientMembershipId: member.id,
              ...patch,
            })
            .returning();
        if (dto.emailEnabled === false)
          await tx
            .update(notificationDeliveryJobs)
            .set({
              status: 'SUPPRESSED',
              completedAt: new Date(),
              leaseUntil: null,
              lockedBy: null,
              leaseToken: null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(notificationDeliveryJobs.workspaceId, w),
                eq(notificationDeliveryJobs.recipientMembershipId, member.id),
                inArray(notificationDeliveryJobs.status, [
                  'PENDING',
                  'FAILED',
                  'PROCESSING',
                ]),
              ),
            );
        if (!row)
          throw new Error('Could not persist notification preferences.');
        await this.audit.append(tx, {
          workspaceId: w,
          actorId: member.id,
          targetType: 'notification_preferences',
          targetId: row.id,
          action: 'notification.preferences_updated',
          metadata: {
            in_app_enabled: row.inAppEnabled,
            email_enabled: row.emailEnabled,
          },
        });
        return row;
      },
      {
        authorize: async (tx) => {
          await this.access.workspace.require(
            tx,
            identity.userId,
            w,
            'preferences.update',
            { lock: true },
          );
        },
      },
    );
  }
  deliveries(userId: string, w: string, id: string) {
    return this.db.db.transaction(async (tx) => {
      await this.access.owned(tx, userId, w, id);
      return tx
        .select({
          id: notificationDeliveryJobs.id,
          status: notificationDeliveryJobs.status,
          attemptCount: notificationDeliveryJobs.attemptCount,
          lastErrorCode: notificationDeliveryJobs.lastErrorCode,
          sentAt: notificationDeliveryJobs.sentAt,
        })
        .from(notificationDeliveryJobs)
        .where(
          and(
            eq(notificationDeliveryJobs.workspaceId, w),
            eq(notificationDeliveryJobs.notificationId, id),
          ),
        );
    });
  }
  retryDelivery(
    identity: Identity,
    w: string,
    id: string,
    acknowledge: boolean,
  ) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { member } = await this.access.owned(tx, identity.userId, w, id);
        const pref = await this.repo.preference(tx, w, member.id);
        if (!pref?.emailEnabled)
          throw new ConflictException('Email notifications are disabled.');
        const [job] = await tx
          .select()
          .from(notificationDeliveryJobs)
          .where(
            and(
              eq(notificationDeliveryJobs.workspaceId, w),
              eq(notificationDeliveryJobs.notificationId, id),
            ),
          )
          .for('update');
        if (!job)
          throw new NotFoundException('Notification delivery not found.');
        if (!['UNKNOWN', 'DEAD', 'FAILED'].includes(job.status))
          throw new ConflictException(
            'Delivery cannot be retried in its current state.',
          );
        if (job.status === 'UNKNOWN' && !acknowledge)
          throw new BadRequestException(
            'Unknown delivery may already have arrived; acknowledge possible duplicate before retry.',
          );
        const [row] = await tx
          .update(notificationDeliveryJobs)
          .set({
            status: 'PENDING',
            runAfter: new Date(),
            completedAt: null,
            lastErrorCode: null,
            leaseUntil: null,
            lockedBy: null,
            leaseToken: null,
            updatedAt: new Date(),
          })
          .where(eq(notificationDeliveryJobs.id, job.id))
          .returning();
        await this.audit.append(tx, {
          workspaceId: w,
          actorId: member.id,
          targetType: 'notification_delivery',
          targetId: job.id,
          action: 'notification.delivery_retried',
          metadata: {
            previous_status: job.status,
            possible_duplicate_acknowledged: acknowledge,
          },
        });
        return { id: row!.id, status: row!.status };
      },
      {
        authorize: async (tx: Tx) => {
          await this.access.owned(tx, identity.userId, w, id, true);
        },
      },
    );
  }
}
