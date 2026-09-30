import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id'),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('audit_logs_workspace_created_idx').on(
      t.workspaceId,
      t.createdAt,
      t.id,
    ),
  ],
);
