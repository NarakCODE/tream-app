import { sql } from 'drizzle-orm';
import {
  index,
  foreignKey,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { companies } from './company.schema';
import { workspaces } from './workspace.schema';

export const contactStatus = pgEnum('contact_status', ['LEAD']);

export const contacts = pgTable(
  'contacts',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    companyId: text('company_id'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    email: text('email').notNull(),
    phone: text('phone'),
    status: contactStatus('status').default('LEAD').notNull(),
    attributes: jsonb('attributes')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
      name: 'contacts_workspace_company_fk',
    }),
    uniqueIndex('contacts_workspace_id_unique_idx').on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex('contacts_workspace_email_active_idx')
      .on(table.workspaceId, sql`lower(${table.email})`)
      .where(sql`${table.deletedAt} is null`),
    index('contacts_workspace_created_id_idx').on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
  ],
);
