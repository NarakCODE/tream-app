import { sql } from 'drizzle-orm';
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { workspaces } from './workspace.schema';

export const companies = pgTable(
  'companies',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    domain: text('domain'),
    industry: text('industry'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('companies_workspace_id_unique_idx').on(
      table.workspaceId,
      table.id,
    ),
    index('companies_workspace_created_id_idx').on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
    index('companies_workspace_domain_active_idx')
      .on(table.workspaceId, table.domain)
      .where(sql`${table.deletedAt} is null`),
  ],
);
