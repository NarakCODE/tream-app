import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { DatabaseService } from '../../../database/database.service';
import { eventDispatchAttempts } from '../../../database/schema/event.schema';
import type {
  ClaimEventDispatchInput,
  CompleteEventDispatchInput,
  EnqueueEventDispatchInput,
  EventDispatchQueue,
  FailEventDispatchInput,
} from '../application/ports/event-dispatch-queue.port';
import type { EventDispatchAttempt } from '../domain/event-dispatch';

const first = <T>(values: T[]): T | null => values[0] ?? null;

@Injectable()
export class DatabaseEventDispatchQueue implements EventDispatchQueue {
  constructor(private readonly database: DatabaseService) {}

  async enqueue(
    input: EnqueueEventDispatchInput,
  ): Promise<EventDispatchAttempt> {
    const now = new Date();
    const attempt = first(
      await this.database.db
        .insert(eventDispatchAttempts)
        .values({
          id: `edp_${ulid()}`,
          eventId: input.eventId,
          availableAt: input.availableAt ?? now,
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
    );
    if (attempt === null) {
      throw new Error('The event dispatch insert returned no row.');
    }
    return attempt;
  }

  claimNext(
    input: ClaimEventDispatchInput,
  ): Promise<EventDispatchAttempt | null> {
    return this.database.db.transaction(async (transaction) => {
      const pending = first(
        await transaction
          .select({ id: eventDispatchAttempts.id })
          .from(eventDispatchAttempts)
          .where(
            or(
              and(
                inArray(eventDispatchAttempts.status, ['PENDING', 'FAILED']),
                lte(eventDispatchAttempts.availableAt, input.now),
                isNull(eventDispatchAttempts.lockedAt),
              ),
              and(
                eq(eventDispatchAttempts.status, 'PROCESSING'),
                lte(eventDispatchAttempts.lockedAt, input.lockExpiredBefore),
              ),
            ),
          )
          .orderBy(
            asc(eventDispatchAttempts.availableAt),
            asc(eventDispatchAttempts.createdAt),
            asc(eventDispatchAttempts.id),
          )
          .for('update', { skipLocked: true })
          .limit(1),
      );
      if (pending === null) {
        return null;
      }
      return first(
        await transaction
          .update(eventDispatchAttempts)
          .set({
            status: 'PROCESSING',
            attemptCount: sql`${eventDispatchAttempts.attemptCount} + 1`,
            lockedAt: input.now,
            lockedBy: input.workerId,
            completedAt: null,
            lastError: null,
            updatedAt: input.now,
          })
          .where(eq(eventDispatchAttempts.id, pending.id))
          .returning(),
      );
    });
  }

  async markSucceeded(input: CompleteEventDispatchInput): Promise<boolean> {
    const updated = await this.database.db
      .update(eventDispatchAttempts)
      .set({
        status: 'SUCCEEDED',
        lockedAt: null,
        lockedBy: null,
        completedAt: input.completedAt,
        updatedAt: input.completedAt,
      })
      .where(
        and(
          eq(eventDispatchAttempts.id, input.dispatchId),
          eq(eventDispatchAttempts.status, 'PROCESSING'),
          eq(eventDispatchAttempts.lockedBy, input.workerId),
        ),
      )
      .returning({ id: eventDispatchAttempts.id });
    return updated.length === 1;
  }

  async markFailed(input: FailEventDispatchInput): Promise<boolean> {
    const updated = await this.database.db
      .update(eventDispatchAttempts)
      .set({
        status: 'FAILED',
        lockedAt: null,
        lockedBy: null,
        completedAt: null,
        lastError: input.error.slice(0, 4_000),
        availableAt: input.availableAt,
        updatedAt: input.failedAt,
      })
      .where(
        and(
          eq(eventDispatchAttempts.id, input.dispatchId),
          eq(eventDispatchAttempts.status, 'PROCESSING'),
          eq(eventDispatchAttempts.lockedBy, input.workerId),
        ),
      )
      .returning({ id: eventDispatchAttempts.id });
    return updated.length === 1;
  }
}
