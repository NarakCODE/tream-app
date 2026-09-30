import { EventConsumerRegistry } from './event-consumer-registry';
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { DatabaseTransaction } from '../../../database/transaction';
import {
  events,
  eventAggregateHeads,
  eventDispatchAttempts,
} from '../../../database/schema/event.schema';
import { EventContractRegistry } from '../infrastructure/event-contract-registry';
@Injectable()
export class EventWriter {
  private readonly revisions = new WeakMap<
    DatabaseTransaction,
    Map<string, number>
  >();
  constructor(
    private readonly contracts: EventContractRegistry,
    private readonly consumers: EventConsumerRegistry,
  ) {}
  async append(
    tx: DatabaseTransaction,
    input: {
      workspaceId: string;
      eventType: string;
      actorId?: string;
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
      correlationId?: string;
    },
  ) {
    this.contracts.validate(
      input.eventType,
      1,
      input.aggregateType,
      input.payload,
    );
    let heads = this.revisions.get(tx);
    if (!heads) {
      heads = new Map();
      this.revisions.set(tx, heads);
    }
    const identity = JSON.stringify([
      input.workspaceId,
      input.aggregateType,
      input.aggregateId,
    ]);
    let revision = heads.get(identity);
    if (!revision) {
      const [head] = await tx
        .insert(eventAggregateHeads)
        .values({
          workspaceId: input.workspaceId,
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId,
          revision: 1,
        })
        .onConflictDoUpdate({
          target: [
            eventAggregateHeads.workspaceId,
            eventAggregateHeads.aggregateType,
            eventAggregateHeads.aggregateId,
          ],
          set: { revision: sql`${eventAggregateHeads.revision}+1` },
        })
        .returning();
      if (!head) throw new Error('Could not reserve aggregate revision');
      revision = head.revision;
      heads.set(identity, revision);
    }
    const eventId = ulid();
    const occurredAt = new Date();
    this.contracts.validateEnvelope({
      id: eventId,
      workspace_id: input.workspaceId,
      event_type: input.eventType,
      schema_version: 1,
      actor_membership_id: input.actorId ?? null,
      aggregate_type: input.aggregateType,
      aggregate_id: input.aggregateId,
      aggregate_version: revision,
      occurred_at: occurredAt.toISOString(),
      payload: input.payload,
      ...(input.correlationId ? { correlation_id: input.correlationId } : {}),
    });
    const [event] = await tx
      .insert(events)
      .values({
        id: eventId,
        ...input,
        schemaVersion: 1,
        aggregateVersion: revision,
        occurredAt,
      })
      .returning();
    if (!event) throw new Error('Could not persist event');
    const jobs = this.consumers
      .keys()
      .map((consumerKey) => ({ id: ulid(), eventId: event.id, consumerKey }));
    if (jobs.length) await tx.insert(eventDispatchAttempts).values(jobs);
    return event;
  }
}
