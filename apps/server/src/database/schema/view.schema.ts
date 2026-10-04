import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { memberships, workspaces } from './workspace.schema';
import { issues, projects, teams } from './work-management.schema';
import { initiatives } from './initiative.schema';
export const viewResource = pgEnum('view_resource', ['ISSUES', 'PROJECTS']);
export const viewVisibility = pgEnum('view_visibility', [
  'PRIVATE',
  'WORKSPACE',
]);
const times = () => ({
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const savedViews = pgTable(
  'saved_views',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    description: text('description'),
    ownerId: text('owner_id').notNull(),
    teamId: text('team_id'),
    projectId: text('project_id'),
    resource: viewResource('resource').notNull(),
    visibility: viewVisibility('visibility').default('PRIVATE').notNull(),
    filters: jsonb('filters')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    display: jsonb('display')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    revision: integer('revision').default(1).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...times(),
  },
  (t) => [
    uniqueIndex('saved_views_workspace_identity_idx').on(t.workspaceId, t.id),
    foreignKey({
      name: 'saved_views_owner_tenant_fk',
      columns: [t.workspaceId, t.ownerId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    foreignKey({
      name: 'saved_views_team_tenant_fk',
      columns: [t.workspaceId, t.teamId],
      foreignColumns: [teams.workspaceId, teams.id],
    }),
    foreignKey({
      name: 'saved_views_project_tenant_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    check('m12_view_name', sql`length(trim(${t.name})) BETWEEN 1 AND 200`),
    check(
      'm12_view_description',
      sql`${t.description} IS NULL OR length(${t.description}) <= 10000`,
    ),
    check(
      'm12_view_filters',
      sql`jsonb_typeof(${t.filters})='object' AND octet_length(${t.filters}::text) <= 32768`,
    ),
    check(
      'm12_view_display',
      sql`jsonb_typeof(${t.display})='object' AND octet_length(${t.display}::text) <= 16384`,
    ),
    check('m12_view_revision', sql`${t.revision}>=1`),
    check(
      'm12_view_lifecycle',
      sql`${t.archivedAt} IS NULL OR ${t.deletedAt} IS NULL`,
    ),
    index('saved_views_history_idx').on(t.workspaceId, t.createdAt, t.id),
  ],
);
export const favorites = pgTable(
  'favorites',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    membershipId: text('membership_id').notNull(),
    issueId: text('issue_id'),
    projectId: text('project_id'),
    teamId: text('team_id'),
    initiativeId: text('initiative_id'),
    viewId: text('view_id'),
    position: integer('position').default(0).notNull(),
    revision: integer('revision').default(1).notNull(),
    ...times(),
  },
  (t) => [
    uniqueIndex('favorites_workspace_identity_idx').on(t.workspaceId, t.id),
    foreignKey({
      name: 'favorites_member_tenant_fk',
      columns: [t.workspaceId, t.membershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    foreignKey({
      name: 'favorites_issue_tenant_fk',
      columns: [t.workspaceId, t.issueId],
      foreignColumns: [issues.workspaceId, issues.id],
    }),
    foreignKey({
      name: 'favorites_project_tenant_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      name: 'favorites_team_tenant_fk',
      columns: [t.workspaceId, t.teamId],
      foreignColumns: [teams.workspaceId, teams.id],
    }),
    foreignKey({
      name: 'favorites_initiative_tenant_fk',
      columns: [t.workspaceId, t.initiativeId],
      foreignColumns: [initiatives.workspaceId, initiatives.id],
    }),
    foreignKey({
      name: 'favorites_view_tenant_fk',
      columns: [t.workspaceId, t.viewId],
      foreignColumns: [savedViews.workspaceId, savedViews.id],
    }),
    check(
      'm12_favorite_target',
      sql`num_nonnulls(${t.issueId},${t.projectId},${t.teamId},${t.initiativeId},${t.viewId})=1`,
    ),
    check('m12_favorite_position', sql`${t.position}>=0`),
    check('m12_favorite_revision', sql`${t.revision}>=1`),
    uniqueIndex('favorites_issue_idx')
      .on(t.membershipId, t.issueId)
      .where(sql`${t.issueId} IS NOT NULL`),
    uniqueIndex('favorites_project_idx')
      .on(t.membershipId, t.projectId)
      .where(sql`${t.projectId} IS NOT NULL`),
    uniqueIndex('favorites_team_idx')
      .on(t.membershipId, t.teamId)
      .where(sql`${t.teamId} IS NOT NULL`),
    uniqueIndex('favorites_initiative_idx')
      .on(t.membershipId, t.initiativeId)
      .where(sql`${t.initiativeId} IS NOT NULL`),
    uniqueIndex('favorites_view_idx')
      .on(t.membershipId, t.viewId)
      .where(sql`${t.viewId} IS NOT NULL`),
  ],
);
