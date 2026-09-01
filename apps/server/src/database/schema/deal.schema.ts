import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { companies } from './company.schema';
import { contacts } from './contact.schema';
import { workspaces } from './workspace.schema';

export const dealStage = pgEnum('deal_stage', ['DISCOVERY']);

export const deals = pgTable(
  'deals',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    companyId: text('company_id'),
    title: text('title').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 })
      .default('0.00')
      .notNull(),
    currency: text('currency').default('USD').notNull(),
    stage: dealStage('stage').default('DISCOVERY').notNull(),
    closeDate: timestamp('close_date', { withTimezone: true }),
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
      name: 'deals_workspace_company_fk',
    }),
    uniqueIndex('deals_workspace_id_unique_idx').on(
      table.workspaceId,
      table.id,
    ),
    check('deals_amount_nonnegative_check', sql`${table.amount} >= 0`),
    check('deals_currency_format_check', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    index('deals_workspace_created_id_active_idx')
      .on(table.workspaceId, table.createdAt, table.id)
      .where(sql`${table.deletedAt} is null`),
    index('deals_workspace_stage_created_id_active_idx')
      .on(table.workspaceId, table.stage, table.createdAt, table.id)
      .where(sql`${table.deletedAt} is null`),
    index('deals_workspace_company_created_id_active_idx')
      .on(table.workspaceId, table.companyId, table.createdAt, table.id)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const dealContacts = pgTable(
  'deal_contacts',
  {
    workspaceId: text('workspace_id').notNull(),
    dealId: text('deal_id').notNull(),
    contactId: text('contact_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.dealId, table.contactId] }),
    foreignKey({
      columns: [table.workspaceId, table.dealId],
      foreignColumns: [deals.workspaceId, deals.id],
      name: 'deal_contacts_workspace_deal_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.contactId],
      foreignColumns: [contacts.workspaceId, contacts.id],
      name: 'deal_contacts_workspace_contact_fk',
    }).onDelete('cascade'),
    index('deal_contacts_workspace_contact_deal_idx').on(
      table.workspaceId,
      table.contactId,
      table.dealId,
    ),
  ],
);
