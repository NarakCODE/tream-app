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
]);

export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'events_event_type_check',
      sql`${table.eventType} in ('workspace.created', 'database.record.created', 'database.record.updated', 'database.record.deleted', 'contact.created', 'contact.updated', 'deal.created', 'deal.stage_changed', 'task.created', 'task.completed', 'email.received', 'email.sent', 'agent.run.completed', 'agent.run.failed', 'team.created', 'team.updated', 'team.retired', 'project.created', 'project.updated', 'project.completed', 'project.canceled', 'issue.created', 'issue.updated', 'issue.assigned', 'issue.status_changed', 'issue.deleted', 'cycle.created', 'cycle.started', 'cycle.completed')`,
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
    uniqueIndex('events_workspace_idempotency_key_idx')
      .on(table.workspaceId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
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
