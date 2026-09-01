import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { contacts } from './contact.schema';
import { deals } from './deal.schema';
import { memberships, workspaces } from './workspace.schema';

export const taskStatus = pgEnum('task_status', [
  'TODO',
  'IN_PROGRESS',
  'DONE',
]);

export const tasks = pgTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    contactId: text('contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    dealId: text('deal_id').references(() => deals.id, {
      onDelete: 'set null',
    }),
    assigneeId: text('assignee_id').references(() => memberships.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    status: taskStatus('status').default('TODO').notNull(),
    dueDate: timestamp('due_date', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('tasks_workspace_created_id_active_idx')
      .on(table.workspaceId, table.createdAt, table.id)
      .where(sql`${table.deletedAt} is null`),
    index('tasks_workspace_status_created_id_active_idx')
      .on(table.workspaceId, table.status, table.createdAt, table.id)
      .where(sql`${table.deletedAt} is null`),
    index('tasks_workspace_assignee_created_id_active_idx')
      .on(table.workspaceId, table.assigneeId, table.createdAt, table.id)
      .where(sql`${table.deletedAt} is null`),
    index('tasks_workspace_contact_active_idx')
      .on(table.workspaceId, table.contactId)
      .where(sql`${table.deletedAt} is null`),
    index('tasks_workspace_deal_active_idx')
      .on(table.workspaceId, table.dealId)
      .where(sql`${table.deletedAt} is null`),
  ],
);
