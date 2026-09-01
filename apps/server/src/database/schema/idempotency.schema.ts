import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth.schema';

export const idempotencyStatus = pgEnum('idempotency_status', [
  'PENDING',
  'COMPLETED',
]);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    method: text('method').notNull(),
    route: text('route').notNull(),
    key: uuid('key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: idempotencyStatus('status').default('PENDING').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<unknown>(),
    responseHeaders: jsonb('response_headers')
      .$type<Record<string, string | string[]>>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('idempotency_keys_user_method_route_key_unique_idx').on(
      table.userId,
      table.method,
      table.route,
      table.key,
    ),
    index('idempotency_keys_expires_at_idx').on(table.expiresAt),
  ],
);
