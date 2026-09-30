import { Injectable } from '@nestjs/common';
import { and, eq, lt, lte, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import type { DatabaseTransaction } from '../../../database/transaction';
import {
  events,
  eventDispatchAttempts,
  eventConsumerReceipts,
} from '../../../database/schema/event.schema';
import { EventContractRegistry } from '../infrastructure/event-contract-registry';

type Lease = typeof eventDispatchAttempts.$inferSelect;
type Event = typeof events.$inferSelect;
const MAX_ATTEMPTS = 5;
const LEASE_MS = 60_000;

/** Invoked by the worker host. Consumers may perform transactional database
 * effects only. Network delivery needs its own idempotent downstream protocol. */
@Injectable()
export class OutboxWorker {
  constructor(
    private readonly database: DatabaseService,
    private readonly contracts: EventContractRegistry,
  ) {}
  async claim(
    workerId: string,
    consumerKey = 'internal',
  ): Promise<Lease | undefined> {
    if (!workerId || !consumerKey)
      throw new Error('Worker and consumer identity required');
    return this.database.db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx
        .select()
        .from(eventDispatchAttempts)
        .where(
          and(
            eq(eventDispatchAttempts.consumerKey, consumerKey),
            lt(eventDispatchAttempts.attemptCount, MAX_ATTEMPTS),
            or(
              and(
                or(
                  eq(eventDispatchAttempts.status, 'PENDING'),
                  eq(eventDispatchAttempts.status, 'FAILED'),
                ),
                lte(eventDispatchAttempts.availableAt, sql`now()`),
              ),
              and(
                eq(eventDispatchAttempts.status, 'PROCESSING'),
                lt(
                  eventDispatchAttempts.lockedAt,
                  sql`now() - interval '60 seconds'`,
                ),
              ),
            ),
          ),
        )
        .orderBy(eventDispatchAttempts.availableAt, eventDispatchAttempts.id)
        .limit(1)
        .for('update', { skipLocked: true });
      if (!row) return undefined;
      const [lease] = await tx
        .update(eventDispatchAttempts)
        .set({
          status: 'PROCESSING',
          lockedBy: workerId,
          lockedAt: now,
          attemptCount: row.attemptCount + 1,
          updatedAt: now,
        })
        .where(eq(eventDispatchAttempts.id, row.id))
        .returning();
      return lease;
    });
  }
  async process(
    lease: Lease,
    consume: (tx: DatabaseTransaction, event: Event) => Promise<void>,
  ): Promise<void> {
    try {
      await this.database.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(eventDispatchAttempts)
          .where(eq(eventDispatchAttempts.id, lease.id))
          .limit(1)
          .for('update');
        if (
          !current ||
          current.status !== 'PROCESSING' ||
          current.lockedBy !== lease.lockedBy ||
          current.lockedAt?.getTime() !== lease.lockedAt?.getTime()
        )
          return;
        const [event] = await tx
          .select()
          .from(events)
          .where(eq(events.id, current.eventId))
          .limit(1);
        if (!event) throw new Error('Missing outbox event');
        try {
          this.contracts.validateEnvelope({
            id: event.id,
            workspace_id: event.workspaceId,
            event_type: event.eventType,
            schema_version: event.schemaVersion,
            actor_membership_id: event.actorId,
            aggregate_type: event.aggregateType,
            aggregate_id: event.aggregateId,
            aggregate_version: event.aggregateVersion,
            occurred_at: event.occurredAt?.toISOString(),
            payload: event.payload,
            ...(event.correlationId
              ? { correlation_id: event.correlationId }
              : {}),
          });
        } catch {
          await tx
            .update(eventDispatchAttempts)
            .set({
              status: 'QUARANTINED',
              lockedAt: null,
              lockedBy: null,
              lastError: 'Unsupported or invalid event contract',
              updatedAt: new Date(),
            })
            .where(eq(eventDispatchAttempts.id, lease.id));
          return;
        }
        const [receipt] = await tx
          .insert(eventConsumerReceipts)
          .values({ eventId: event.id, consumerKey: current.consumerKey })
          .onConflictDoNothing()
          .returning();
        if (receipt) await consume(tx, event);
        await tx
          .update(eventDispatchAttempts)
          .set({
            status: 'SUCCEEDED',
            lockedAt: null,
            lockedBy: null,
            completedAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(eventDispatchAttempts.id, lease.id));
      });
    } catch {
      // No payload/error detail is persisted; downstream exceptions can carry secrets.
      await this.database.db
        .update(eventDispatchAttempts)
        .set({
          status: lease.attemptCount >= MAX_ATTEMPTS ? 'QUARANTINED' : 'FAILED',
          lockedAt: null,
          lockedBy: null,
          lastError: 'Consumer execution failed',
          availableAt: new Date(
            Date.now() + Math.min(60_000, 1000 * 2 ** lease.attemptCount),
          ),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(eventDispatchAttempts.id, lease.id),
            eq(eventDispatchAttempts.status, 'PROCESSING'),
            eq(eventDispatchAttempts.lockedBy, lease.lockedBy ?? ''),
            sql`${eventDispatchAttempts.lockedAt} = ${lease.lockedAt}`,
          ),
        );
    }
  }
  async quarantineExhausted(): Promise<void> {
    await this.database.db
      .update(eventDispatchAttempts)
      .set({
        status: 'QUARANTINED',
        lockedAt: null,
        lockedBy: null,
        lastError: 'Retry limit exhausted',
        updatedAt: new Date(),
      })
      .where(
        and(
          sql`${eventDispatchAttempts.attemptCount} >= ${MAX_ATTEMPTS}`,
          or(
            eq(eventDispatchAttempts.status, 'FAILED'),
            and(
              eq(eventDispatchAttempts.status, 'PROCESSING'),
              lt(
                eventDispatchAttempts.lockedAt,
                new Date(Date.now() - LEASE_MS),
              ),
            ),
          ),
        ),
      );
  }
}
