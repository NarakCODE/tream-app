import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, lte, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { ApplicationConfiguration } from '../../../config/configuration.interface';
import { DatabaseService } from '../../../database/database.service';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import {
  files,
  storageCleanupJobs,
  workspaces,
} from '../../../database/schema';
import { ObjectStorage } from '../domain/object-storage.port';
import { FileRepository } from '../infrastructure/file.repository';
import { FileFactsService } from './file-facts.service';
@Injectable()
export class FileCleanupWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(FileCleanupWorker.name);
  private readonly workerId = randomUUID();
  private timer?: NodeJS.Timeout;
  private running: Promise<number> | undefined;
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<ApplicationConfiguration, true>,
    private readonly storage: ObjectStorage,
    private readonly repository: FileRepository,
    private readonly facts: FileFactsService,
  ) {}
  onApplicationBootstrap() {
    if (
      !this.config.getOrThrow('app.backgroundWorkersEnabled', { infer: true })
    )
      return;
    this.timer = setInterval(() => {
      void this.run().catch(() =>
        this.logger.error(
          'File cleanup sweep failed; committed jobs will be retried.',
        ),
      );
    }, 30000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }
  run() {
    if (this.running) return this.running;
    const task = this.sweep();
    this.running = task;
    void task
      .finally(() => {
        if (this.running === task) this.running = undefined;
      })
      .catch(() => undefined);
    return task;
  }
  private async lockWorkspace(tx: Tx, w: string) {
    await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, w))
      .for('update');
  }
  private async sweep() {
    await this.expireIntents();
    let completed = 0;
    const now = new Date();
    const max = this.config.getOrThrow('files.cleanupMaxAttempts', {
      infer: true,
    });
    const candidates = await this.db.db
      .select()
      .from(storageCleanupJobs)
      .where(
        and(
          or(
            and(
              inArray(storageCleanupJobs.status, ['PENDING', 'FAILED']),
              lte(storageCleanupJobs.runAfter, now),
            ),
            and(
              eq(storageCleanupJobs.status, 'PROCESSING'),
              lte(storageCleanupJobs.lockedUntil, now),
            ),
          ),
        ),
      )
      .orderBy(storageCleanupJobs.workspaceId, storageCleanupJobs.fileId)
      .limit(25);
    for (const candidate of candidates) {
      const claim = await this.db.db.transaction(async (tx) => {
        await this.lockWorkspace(tx, candidate.workspaceId);
        const file = await this.repository.file(
          tx,
          candidate.workspaceId,
          candidate.fileId,
          true,
        );
        const [job] = await tx
          .select()
          .from(storageCleanupJobs)
          .where(eq(storageCleanupJobs.id, candidate.id))
          .for('update');
        if (
          !file ||
          !job ||
          !['PENDING', 'FAILED', 'PROCESSING'].includes(job.status)
        )
          return null;
        const timestamp = new Date();
        if (
          job.status === 'PROCESSING' &&
          job.lockedUntil &&
          job.lockedUntil > timestamp
        )
          return null;
        if (job.status !== 'PROCESSING' && job.runAfter > timestamp)
          return null;
        if (!['DELETED', 'EXPIRED', 'PURGING'].includes(file.status)) {
          await tx
            .update(storageCleanupJobs)
            .set({
              status: 'CANCELED',
              completedAt: timestamp,
              lockedBy: null,
              lockedUntil: null,
              updatedAt: timestamp,
            })
            .where(eq(storageCleanupJobs.id, job.id));
          return null;
        }
        if (
          file.status === 'DELETED' &&
          (!file.purgeAfter || file.purgeAfter > timestamp)
        )
          return null;
        if (file.status !== 'PURGING')
          await tx
            .update(files)
            .set({
              status: 'PURGING',
              revision: file.revision + 1,
              updatedAt: timestamp,
            })
            .where(eq(files.id, file.id));
        const [row] = await tx
          .update(storageCleanupJobs)
          .set({
            status: 'PROCESSING',
            lockedBy: this.workerId,
            lockedUntil: new Date(
              timestamp.getTime() +
                this.config.getOrThrow('files.cleanupLeaseSeconds', {
                  infer: true,
                }) *
                  1000,
            ),
            attemptCount: Math.min(job.attemptCount + 1, max),
            lastError: null,
            updatedAt: timestamp,
          })
          .where(eq(storageCleanupJobs.id, job.id))
          .returning();
        return row!;
      });
      if (!claim) continue;
      try {
        await this.storage.remove(claim.storageKey);
        const done = await this.db.db.transaction(async (tx) => {
          await this.lockWorkspace(tx, claim.workspaceId);
          const file = await this.repository.file(
            tx,
            claim.workspaceId,
            claim.fileId,
            true,
          );
          const [job] = await tx
            .select()
            .from(storageCleanupJobs)
            .where(eq(storageCleanupJobs.id, claim.id))
            .for('update');
          if (
            !file ||
            !job ||
            job.status !== 'PROCESSING' ||
            job.lockedBy !== this.workerId
          )
            return false;
          const timestamp = new Date();
          await tx
            .update(storageCleanupJobs)
            .set({
              status: 'SUCCEEDED',
              completedAt: timestamp,
              lockedUntil: null,
              lockedBy: null,
              lastError: null,
              updatedAt: timestamp,
            })
            .where(eq(storageCleanupJobs.id, job.id));
          if (file.status === 'PURGING') {
            await tx
              .update(files)
              .set({
                status: 'PURGED',
                purgedAt: timestamp,
                revision: file.revision + 1,
                updatedAt: timestamp,
              })
              .where(eq(files.id, file.id));
            await this.facts.file(
              tx,
              file.workspaceId,
              undefined,
              file.id,
              'purged',
            );
          }
          return true;
        });
        if (done) completed++;
      } catch {
        await this.db.db.transaction(async (tx) => {
          await this.lockWorkspace(tx, claim.workspaceId);
          await this.repository.file(tx, claim.workspaceId, claim.fileId, true);
          await tx
            .update(storageCleanupJobs)
            .set({
              status: 'FAILED',
              lockedBy: null,
              lockedUntil: null,
              lastError: 'STORAGE_UNAVAILABLE',
              runAfter: new Date(
                Date.now() +
                  Math.min(3600, 2 ** Math.min(claim.attemptCount, 10) * 30) *
                    1000,
              ),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(storageCleanupJobs.id, claim.id),
                eq(storageCleanupJobs.status, 'PROCESSING'),
                eq(storageCleanupJobs.lockedBy, this.workerId),
              ),
            );
        });
        this.logger.warn('File cleanup failed; retry state was retained.');
      }
    }
    return completed;
  }
  private async expireIntents() {
    const expired = await this.db.db
      .select({ id: files.id, workspaceId: files.workspaceId })
      .from(files)
      .where(
        and(
          inArray(files.status, ['PENDING', 'UPLOADED', 'QUARANTINED']),
          lte(files.uploadExpiresAt, new Date()),
        ),
      )
      .orderBy(files.workspaceId, files.id)
      .limit(25);
    for (const candidate of expired)
      await this.db.db.transaction(async (tx) => {
        await this.lockWorkspace(tx, candidate.workspaceId);
        const file = await this.repository.file(
          tx,
          candidate.workspaceId,
          candidate.id,
          true,
        );
        if (
          !file ||
          !['PENDING', 'UPLOADED', 'QUARANTINED'].includes(file.status) ||
          file.uploadExpiresAt > new Date()
        )
          return;
        const now = new Date();
        await tx
          .update(files)
          .set({
            status: 'EXPIRED',
            revision: file.revision + 1,
            updatedAt: now,
          })
          .where(eq(files.id, file.id));
        await tx.insert(storageCleanupJobs).values({
          id: randomUUID(),
          workspaceId: file.workspaceId,
          fileId: file.id,
          storageKey: file.storageKey,
          reason: 'ABANDONED',
          runAfter: now,
        });
        await this.facts.file(
          tx,
          file.workspaceId,
          undefined,
          file.id,
          'expired',
        );
      });
  }
}
