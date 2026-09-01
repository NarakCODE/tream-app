import {
  boolean,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth.schema';
import { workspaces } from './workspace.schema';

export const dynamicFieldType = pgEnum('dynamic_field_type', [
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'CURRENCY',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'EMAIL',
  'PHONE',
  'URL',
  'SELECT',
  'MULTI_SELECT',
  'STATUS',
  'USER',
  'RELATION',
  'CREATED_AT',
  'UPDATED_AT',
]);

export const dynamicDatabases = pgTable(
  'dynamic_databases',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('dynamic_databases_workspace_id_unique_idx').on(
      table.workspaceId,
      table.id,
    ),
    index('dynamic_databases_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const dynamicFields = pgTable(
  'dynamic_fields',
  {
    id: text('id').primaryKey(),
    databaseId: text('database_id')
      .notNull()
      .references(() => dynamicDatabases.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    key: text('key').notNull(),
    type: dynamicFieldType('type').notNull(),
    isRequired: boolean('is_required').default(false).notNull(),
    config: jsonb('config')
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
    uniqueIndex('dynamic_fields_database_key_active_idx').on(
      table.databaseId,
      table.key,
    ),
    index('dynamic_fields_database_created_idx').on(
      table.databaseId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const dynamicRecords = pgTable(
  'dynamic_records',
  {
    id: text('id').primaryKey(),
    databaseId: text('database_id').notNull(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    values: jsonb('values')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
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
      columns: [table.workspaceId, table.databaseId],
      foreignColumns: [dynamicDatabases.workspaceId, dynamicDatabases.id],
      name: 'dynamic_records_workspace_database_fk',
    }).onDelete('cascade'),
    index('dynamic_records_database_created_idx').on(
      table.databaseId,
      table.createdAt,
      table.id,
    ),
    index('dynamic_records_workspace_idx').on(table.workspaceId),
  ],
);
