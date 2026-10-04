import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, lte, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { ApplicationConfiguration } from '../../../config/configuration.interface';
import { DatabaseService } from '../../../database/database.service';
import {
  notificationDeliveryJobs,
  notifications,
  workspaces,
} from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { NotificationMailSender } from './notification-mail';
import { NotificationAccessService } from './notification-access.service';
import { NotificationRepository } from '../infrastructure/notification.repository';
import {
  isDefinitiveMailRejection,
  MAX_MAIL_ATTEMPTS,
  MAIL_LEASE_MS,
  retryDelayMs,
} from '../domain/notification-policy';
@Injectable()
export class NotificationMailWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationMailWorker.name);
  private readonly workerId = randomUUID();
  private timer?: NodeJS.Timeout;
  private active: Promise<number> | undefined;
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<ApplicationConfiguration, true>,
    private readonly access: NotificationAccessService,
    private readonly repository: NotificationRepository,
    private readonly mail: NotificationMailSender,
  ) {}
  onApplicationBootstrap() {
    // Polling disabled to prevent continuous request errors in local dev
    if (false as boolean) {
      if (
        !this.config.getOrThrow('app.backgroundWorkersEnabled', { infer: true })
      )
        return;
      this.timer = setInterval(() => {
        void this.run().catch(() =>
          this.logger.error(
            'Notification delivery polling failed; durable state retained.',
          ),
        );
      }, 1000);
      this.timer.unref();
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.active?.catch(() => undefined);
  }
  run() {
    if (this.active) return this.active;
    const task = this.drain();
    this.active = task;
    void task
      .finally(() => {
        if (this.active === task) this.active = undefined;
      })
      .catch(() => undefined);
    return task;
  }
  private lock(tx: Tx, w: string) {
    return tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, w))
      .for('update');
  }
  private async drain() {
    await this.recover();
    const candidates = await this.db.db
      .select()
      .from(notificationDeliveryJobs)
      .where(
        and(
          inArray(notificationDeliveryJobs.status, ['PENDING', 'FAILED']),
          lte(notificationDeliveryJobs.runAfter, new Date()),
          or(
            eq(notificationDeliveryJobs.status, 'PENDING'),
            sql`${notificationDeliveryJobs.attemptCount}<${MAX_MAIL_ATTEMPTS}`,
          ),
        ),
      )
      .orderBy(notificationDeliveryJobs.runAfter, notificationDeliveryJobs.id)
      .limit(20);
    let delivered = 0;
    for (const candidate of candidates) {
      const claim = await this.db.db.transaction(async (tx) => {
        await this.lock(tx, candidate.workspaceId);
        const [job] = await tx
          .select()
          .from(notificationDeliveryJobs)
          .where(eq(notificationDeliveryJobs.id, candidate.id))
          .for('update');
        if (
          !job ||
          !['PENDING', 'FAILED'].includes(job.status) ||
          job.runAfter > new Date() ||
          (job.status === 'FAILED' && job.attemptCount >= MAX_MAIL_ATTEMPTS)
        )
          return null;
        const [notification] = await tx
          .select()
          .from(notifications)
          .where(eq(notifications.id, job.notificationId))
          .limit(1);
        if (!notification) return null;
        let recipient;
        try {
          recipient = await this.access.recipient(
            tx,
            job.workspaceId,
            job.recipientMembershipId,
          );
          await this.access.source(tx, recipient.user.id, notification);
          const prefs = await this.repository.preference(
            tx,
            job.workspaceId,
            job.recipientMembershipId,
          );
          if (!prefs?.emailEnabled || notification.archivedAt)
            throw new NotFoundException();
        } catch (error) {
          if (
            !(error instanceof ForbiddenException) &&
            !(error instanceof NotFoundException)
          )
            throw error;
          await tx
            .update(notificationDeliveryJobs)
            .set({
              status: 'SUPPRESSED',
              completedAt: new Date(),
              lastErrorCode: 'SOURCE_PERMISSION_REVOKED',
              leaseUntil: null,
              lockedBy: null,
              leaseToken: null,
              updatedAt: new Date(),
            })
            .where(eq(notificationDeliveryJobs.id, job.id));
          return null;
        }
        if (
          notification.snoozedUntil &&
          notification.snoozedUntil > new Date()
        ) {
          await tx
            .update(notificationDeliveryJobs)
            .set({ runAfter: notification.snoozedUntil, updatedAt: new Date() })
            .where(eq(notificationDeliveryJobs.id, job.id));
          return null;
        }
        const [row] = await tx
          .update(notificationDeliveryJobs)
          .set({
            status: 'PROCESSING',
            attemptCount: job.attemptCount + 1,
            leaseUntil: new Date(Date.now() + MAIL_LEASE_MS),
            lockedBy: this.workerId,
            leaseToken: randomUUID(),
            lastErrorCode: null,
            updatedAt: new Date(),
          })
          .where(eq(notificationDeliveryJobs.id, job.id))
          .returning();
        return {
          job: row!,
          email: recipient.user.email,
          kind: notification.kind,
        };
      });
      if (!claim) continue;
      const ready = await this.db.db.transaction(async (tx) => {
        await this.lock(tx, claim.job.workspaceId);
        const [job] = await tx
          .select()
          .from(notificationDeliveryJobs)
          .where(eq(notificationDeliveryJobs.id, claim.job.id))
          .for('update');
        if (
          !job ||
          job.status !== 'PROCESSING' ||
          job.leaseToken !== claim.job.leaseToken ||
          !job.leaseUntil ||
          job.leaseUntil <= new Date()
        )
          return false;
        const [notification] = await tx
          .select()
          .from(notifications)
          .where(eq(notifications.id, job.notificationId))
          .limit(1);
        let email: string;
        try {
          if (!notification) throw new NotFoundException();
          const recipient = await this.access.recipient(
            tx,
            job.workspaceId,
            job.recipientMembershipId,
          );
          email = recipient.user.email;
          await this.access.source(tx, recipient.user.id, notification);
          const prefs = await this.repository.preference(
            tx,
            job.workspaceId,
            job.recipientMembershipId,
          );
          if (!prefs?.emailEnabled || notification.archivedAt)
            throw new NotFoundException();
        } catch (error) {
          if (
            !(error instanceof ForbiddenException) &&
            !(error instanceof NotFoundException)
          )
            throw error;
          await tx
            .update(notificationDeliveryJobs)
            .set({
              status: 'SUPPRESSED',
              completedAt: new Date(),
              lastErrorCode: 'SOURCE_PERMISSION_REVOKED',
              leaseUntil: null,
              lockedBy: null,
              leaseToken: null,
              updatedAt: new Date(),
            })
            .where(eq(notificationDeliveryJobs.id, job.id));
          return false;
        }
        if (
          notification.snoozedUntil &&
          notification.snoozedUntil > new Date()
        ) {
          await tx
            .update(notificationDeliveryJobs)
            .set({
              status: 'PENDING',
              runAfter: notification.snoozedUntil,
              leaseUntil: null,
              lockedBy: null,
              leaseToken: null,
              updatedAt: new Date(),
            })
            .where(eq(notificationDeliveryJobs.id, job.id));
          return false;
        }
        await tx
          .update(notificationDeliveryJobs)
          .set({ status: 'SENDING', updatedAt: new Date() })
          .where(eq(notificationDeliveryJobs.id, job.id));
        return { email };
      });
      if (!ready) continue;
      let status: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | 'DEAD' = 'SUCCEEDED';
      let code: string | null = null;
      try {
        await this.mail.send({
          to: ready.email,
          subject: 'Tream notification',
          text: `You have a ${claim.kind.toLowerCase().replaceAll('_', ' ')} notification. Sign in to Tream to review your inbox.`,
          messageId: `<${claim.job.messageId}@notifications.tream>`,
        });
      } catch (error) {
        if (isDefinitiveMailRejection(error)) {
          status =
            claim.job.attemptCount >= MAX_MAIL_ATTEMPTS ? 'DEAD' : 'FAILED';
          code = 'SMTP_REJECTED';
        } else {
          status = 'UNKNOWN';
          code = 'SMTP_ACCEPTANCE_UNKNOWN';
        }
      }
      await this.db.db.transaction(async (tx) => {
        await this.lock(tx, claim.job.workspaceId);
        const [job] = await tx
          .select()
          .from(notificationDeliveryJobs)
          .where(eq(notificationDeliveryJobs.id, claim.job.id))
          .for('update');
        if (
          !job ||
          job.status !== 'SENDING' ||
          job.leaseToken !== claim.job.leaseToken
        )
          return;
        const now = new Date();
        await tx
          .update(notificationDeliveryJobs)
          .set({
            status,
            leaseUntil: null,
            lockedBy: null,
            leaseToken: null,
            lastErrorCode: code,
            sentAt: status === 'SUCCEEDED' ? now : null,
            completedAt: status === 'FAILED' ? null : now,
            runAfter:
              status === 'FAILED'
                ? new Date(now.getTime() + retryDelayMs(job.attemptCount))
                : job.runAfter,
            updatedAt: now,
          })
          .where(eq(notificationDeliveryJobs.id, job.id));
      });
      if (status === 'SUCCEEDED') delivered++;
    }
    return delivered;
  }
  private async recover() {
    const stale = await this.db.db
      .select()
      .from(notificationDeliveryJobs)
      .where(
        and(
          inArray(notificationDeliveryJobs.status, ['PROCESSING', 'SENDING']),
          lte(notificationDeliveryJobs.leaseUntil, new Date()),
        ),
      )
      .limit(50);
    for (const candidate of stale)
      await this.db.db.transaction(async (tx) => {
        await this.lock(tx, candidate.workspaceId);
        const [job] = await tx
          .select()
          .from(notificationDeliveryJobs)
          .where(eq(notificationDeliveryJobs.id, candidate.id))
          .for('update');
        if (
          !job ||
          !['PROCESSING', 'SENDING'].includes(job.status) ||
          !job.leaseUntil ||
          job.leaseUntil > new Date()
        )
          return;
        const status =
          job.status === 'SENDING'
            ? 'UNKNOWN'
            : job.attemptCount >= MAX_MAIL_ATTEMPTS
              ? 'DEAD'
              : 'FAILED';
        await tx
          .update(notificationDeliveryJobs)
          .set({
            status,
            leaseUntil: null,
            lockedBy: null,
            leaseToken: null,
            lastErrorCode:
              status === 'UNKNOWN'
                ? 'SMTP_ACCEPTANCE_UNKNOWN'
                : 'LEASE_EXPIRED',
            completedAt: status === 'FAILED' ? null : new Date(),
            runAfter: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(notificationDeliveryJobs.id, job.id));
      });
  }
}
