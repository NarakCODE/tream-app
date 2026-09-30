import { Injectable } from '@nestjs/common';
import { and, eq, lt, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import type { DatabaseTransaction } from '../../database/transaction';
import { idempotencyKeys } from '../../database/schema/idempotency.schema';
import { ResourceConflictException } from '../exceptions/resource-conflict.exception';
import type { IdempotencyReservationInput } from './idempotency.types';

@Injectable()
export class CommandBus {
  constructor(private readonly database: DatabaseService) {}

  execute<T>(
    input: IdempotencyReservationInput,
    handler: (tx: DatabaseTransaction) => Promise<T>,
    options: {
      statusCode?: number;
      authorize?: (tx: DatabaseTransaction) => Promise<void>;
    } = {},
  ): Promise<T> {
    return this.database.db.transaction(async (tx) => {
      // Serializes matching identities, including concurrent first use. The
      // transaction lock and response row disappear together on rollback.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.userId, input.method, input.route, input.key])}, 0))`,
      );
      if (options.authorize) await options.authorize(tx);
      const identity = and(
        eq(idempotencyKeys.userId, input.userId),
        eq(idempotencyKeys.method, input.method),
        eq(idempotencyKeys.route, input.route),
        eq(idempotencyKeys.key, input.key),
      );
      await tx
        .delete(idempotencyKeys)
        .where(and(identity, lt(idempotencyKeys.expiresAt, new Date())));
      const [existing] = await tx
        .select()
        .from(idempotencyKeys)
        .where(identity)
        .limit(1);
      if (existing) {
        if (existing.requestHash !== input.requestHash)
          throw new ResourceConflictException(
            'The Idempotency-Key was used with a different payload.',
          );
        if (existing.status !== 'COMPLETED')
          throw new ResourceConflictException(
            'The command is already in progress.',
          );
        return existing.responseBody as T;
      }
      const body = await handler(tx);
      // JSON serialization fails before commit for non-replayable responses.
      const persisted = JSON.parse(JSON.stringify(body ?? null)) as T;
      await tx.insert(idempotencyKeys).values({
        ...input,
        status: 'COMPLETED',
        responseStatus: options.statusCode ?? 200,
        responseBody: persisted,
        responseHeaders: {},
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      });
      return persisted;
    });
  }
}
