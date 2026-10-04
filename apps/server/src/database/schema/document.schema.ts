import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { memberships, workspaces } from './workspace.schema';
import { projects, teams } from './work-management.schema';
import { initiatives } from './initiative.schema';
export const documents = pgTable(
  'documents',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    authorId: text('author_id').notNull(),
    projectId: text('project_id'),
    teamId: text('team_id'),
    initiativeId: text('initiative_id'),
    revision: integer('revision').default(1).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('documents_workspace_identity_idx').on(t.workspaceId, t.id),
    foreignKey({
      name: 'documents_author_tenant_fk',
      columns: [t.workspaceId, t.authorId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    foreignKey({
      name: 'documents_project_tenant_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      name: 'documents_team_tenant_fk',
      columns: [t.workspaceId, t.teamId],
      foreignColumns: [teams.workspaceId, teams.id],
    }),
    foreignKey({
      name: 'documents_initiative_tenant_fk',
      columns: [t.workspaceId, t.initiativeId],
      foreignColumns: [initiatives.workspaceId, initiatives.id],
    }),
    check(
      'm11_document_target',
      sql`num_nonnulls(${t.projectId},${t.teamId},${t.initiativeId})=1`,
    ),
    check(
      'm11_document_title',
      sql`length(trim(${t.title})) BETWEEN 1 AND 200`,
    ),
    check('m11_document_body', sql`length(${t.body}) <= 200000`),
    check('m11_document_revision', sql`${t.revision}>=1`),
    check(
      'm11_document_lifecycle',
      sql`${t.archivedAt} IS NULL OR ${t.deletedAt} IS NULL`,
    ),
    index('documents_history_idx').on(t.workspaceId, t.createdAt, t.id),
  ],
);
