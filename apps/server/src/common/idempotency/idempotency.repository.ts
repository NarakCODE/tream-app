import { Injectable } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { idempotencyKeys } from '../../database/schema/idempotency.schema';
import type {
  IdempotencyIdentity,
  IdempotencyReservation,
  IdempotencyReservationInput,
  StoredIdempotencyResponse,
} from './idempotency.types';

const PENDING_TTL_MS = 5 * 60 * 1000;
const COMPLETED_TTL_MS = 24 * 60 * 60 * 1000;

const identityWhere = (identity: IdempotencyIdentity) =>
  and(
    eq(idempotencyKeys.userId, identity.userId),
    eq(idempotencyKeys.method, identity.method),
    eq(idempotencyKeys.route, identity.route),
    eq(idempotencyKeys.key, identity.key),
  );

@Injectable()
export class IdempotencyRepository {
  constructor(private readonly database: DatabaseService) {}

  async reserve(
    input: IdempotencyReservationInput,
  ): Promise<IdempotencyReservation> {
    const now = new Date();
    const identity = input;

    // Expired pending rows are abandoned requests (for example after a process
    // crash), while completed rows expire after their replay window.
    await this.database.db
      .delete(idempotencyKeys)
      .where(and(identityWhere(identity), lt(idempotencyKeys.expiresAt, now)));

    const [created] = await this.database.db
      .insert(idempotencyKeys)
      .values({
        ...input,
        expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
      })
      .onConflictDoNothing()
      .returning({ id: idempotencyKeys.id });

    if (created) {
      return { kind: 'reserved', id: created.id };
    }

    const [existing] = await this.database.db
      .select()
      .from(idempotencyKeys)
      .where(identityWhere(identity))
      .limit(1);

    // A concurrent expiry cleanup can remove the row between the insert and
    // read. Retrying is safe because the unique index remains the arbiter.
    if (!existing) {
      return this.reserve(input);
    }

    if (existing.requestHash !== input.requestHash) {
      return { kind: 'payload-conflict' };
    }

    if (existing.status === 'PENDING') {
      return { kind: 'in-progress' };
    }

    if (existing.responseStatus === null) {
      return { kind: 'in-progress' };
    }

    return {
      kind: 'replay',
      response: {
        statusCode: existing.responseStatus,
        body: existing.responseBody,
        headers: existing.responseHeaders,
      },
    };
  }

  async complete(
    id: string,
    response: StoredIdempotencyResponse,
  ): Promise<void> {
    const now = new Date();
    await this.database.db
      .update(idempotencyKeys)
      .set({
        status: 'COMPLETED',
        responseStatus: response.statusCode,
        responseBody: response.body,
        responseHeaders: response.headers,
        completedAt: now,
        expiresAt: new Date(now.getTime() + COMPLETED_TTL_MS),
      })
      .where(eq(idempotencyKeys.id, id));
  }

  async release(id: string): Promise<void> {
    await this.database.db
      .delete(idempotencyKeys)
      .where(eq(idempotencyKeys.id, id));
  }
}
