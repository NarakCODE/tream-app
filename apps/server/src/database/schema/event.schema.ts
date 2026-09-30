import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { workspaces } from './workspace.schema';

export const eventDispatchStatus = pgEnum('event_dispatch_status', [
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'QUARANTINED',
]);

export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    schemaVersion: integer('schema_version'),
    actorId: text('actor_id'),
    aggregateType: text('aggregate_type'),
    aggregateId: text('aggregate_id'),
    aggregateVersion: integer('aggregate_version'),
    correlationId: text('correlation_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'events_version_positive',
      sql`${table.schemaVersion} is null or ${table.schemaVersion} > 0`,
    ),
    index('events_workspace_type_created_id_idx').on(
      table.workspaceId,
      table.eventType,
      table.createdAt,
      table.id,
    ),
    index('events_workspace_created_id_idx').on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
    index('events_aggregate_revision_fact_idx').on(
      table.workspaceId,
      table.aggregateType,
      table.aggregateId,
      table.aggregateVersion,
      table.eventType,
    ),
  ],
);

/**
 * Durable database outbox. A PENDING row means delivery has been requested,
 * not that a downstream consumer has received the event.
 */
export const eventDispatchAttempts = pgTable(
  'event_dispatch_attempts',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    consumerKey: text('consumer_key').notNull().default('internal'),
    status: eventDispatchStatus('status').default('PENDING').notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('event_dispatch_event_consumer_unique').on(
      table.eventId,
      table.consumerKey,
    ),
    check(
      'event_dispatch_attempts_lease_check',
      sql`(${table.status} = 'PROCESSING' and ${table.lockedAt} is not null and ${table.lockedBy} is not null) or (${table.status} <> 'PROCESSING' and ${table.lockedAt} is null and ${table.lockedBy} is null)`,
    ),
    check(
      'event_dispatch_attempt_count_check',
      sql`${table.attemptCount} >= 0`,
    ),
    index('event_dispatch_attempts_pending_idx')
      .on(table.status, table.availableAt, table.createdAt, table.id)
      .where(sql`${table.status} in ('PENDING', 'FAILED')`),
    index('event_dispatch_attempts_event_created_idx').on(
      table.eventId,
      table.createdAt,
    ),
    index('event_dispatch_attempts_processing_lock_idx')
      .on(table.status, table.lockedAt)
      .where(sql`${table.status} = 'PROCESSING'`),
  ],
);

export const eventAggregateHeads = pgTable(
  'event_aggregate_heads',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    revision: integer('revision').notNull(),
  },
  (t) => [
    uniqueIndex('event_aggregate_heads_identity').on(
      t.workspaceId,
      t.aggregateType,
      t.aggregateId,
    ),
    check('event_aggregate_heads_revision_positive', sql`${t.revision}>0`),
  ],
);

export const eventConsumerReceipts = pgTable(
  'event_consumer_receipts',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    consumerKey: text('consumer_key').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('event_consumer_receipts_identity').on(
      t.eventId,
      t.consumerKey,
    ),
  ],
);
