import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { memberships, workspaces } from './workspace.schema';
import { projects, updateHealth } from './work-management.schema';
export const initiativeStatus = pgEnum('initiative_status', [
  'PLANNED',
  'ACTIVE',
  'COMPLETED',
  'CANCELED',
]);
const times = () => ({
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const initiatives = pgTable(
  'initiatives',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    description: text('description'),
    status: initiativeStatus('status').default('PLANNED').notNull(),
    ownerId: text('owner_id'),
    createdById: text('created_by_id').notNull(),
    targetDate: date('target_date'),
    position: integer('position').default(0).notNull(),
    revision: integer('revision').default(1).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...times(),
  },
  (t) => [
    uniqueIndex('initiatives_workspace_identity_idx').on(t.workspaceId, t.id),
    foreignKey({
      name: 'initiatives_owner_tenant_fk',
      columns: [t.workspaceId, t.ownerId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    foreignKey({
      name: 'initiatives_creator_tenant_fk',
      columns: [t.workspaceId, t.createdById],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    check(
      'm11_initiative_name',
      sql`length(trim(${t.name})) BETWEEN 1 AND 200`,
    ),
    check(
      'm11_initiative_description',
      sql`${t.description} IS NULL OR length(${t.description}) <= 100000`,
    ),
    check('m11_initiative_revision', sql`${t.revision} >= 1`),
    check('m11_initiative_position', sql`${t.position} >= 0`),
    check(
      'm11_initiative_lifecycle',
      sql`${t.archivedAt} IS NULL OR ${t.deletedAt} IS NULL`,
    ),
    index('initiatives_history_idx').on(t.workspaceId, t.createdAt, t.id),
  ],
);
export const initiativeProjects = pgTable(
  'initiative_projects',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    initiativeId: text('initiative_id').notNull(),
    projectId: text('project_id').notNull(),
    position: integer('position').default(0).notNull(),
    revision: integer('revision').default(1).notNull(),
    ...times(),
  },
  (t) => [
    foreignKey({
      name: 'initiative_projects_initiative_tenant_fk',
      columns: [t.workspaceId, t.initiativeId],
      foreignColumns: [initiatives.workspaceId, initiatives.id],
    }),
    foreignKey({
      name: 'initiative_projects_project_tenant_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    uniqueIndex('initiative_projects_link_idx').on(t.initiativeId, t.projectId),
    uniqueIndex('initiative_projects_position_idx').on(
      t.initiativeId,
      t.position,
    ),
    check('m11_initiative_project_position', sql`${t.position} >= 0`),
    check('m11_initiative_project_revision', sql`${t.revision} >= 1`),
  ],
);
export const initiativeUpdates = pgTable(
  'initiative_updates',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    initiativeId: text('initiative_id').notNull(),
    authorId: text('author_id').notNull(),
    body: text('body').notNull(),
    health: updateHealth('health').notNull(),
    revision: integer('revision').default(1).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...times(),
  },
  (t) => [
    uniqueIndex('initiative_updates_workspace_identity_idx').on(
      t.workspaceId,
      t.id,
    ),
    foreignKey({
      name: 'initiative_updates_initiative_tenant_fk',
      columns: [t.workspaceId, t.initiativeId],
      foreignColumns: [initiatives.workspaceId, initiatives.id],
    }),
    foreignKey({
      name: 'initiative_updates_author_tenant_fk',
      columns: [t.workspaceId, t.authorId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    check(
      'm11_initiative_update_body',
      sql`length(trim(${t.body})) BETWEEN 1 AND 50000`,
    ),
    check('m11_initiative_update_revision', sql`${t.revision} >= 1`),
    index('initiative_updates_history_idx').on(
      t.initiativeId,
      t.createdAt,
      t.id,
    ),
  ],
);
export const initiativeSubscribers = pgTable(
  'initiative_subscribers',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    initiativeId: text('initiative_id').notNull(),
    membershipId: text('membership_id').notNull(),
    ...times(),
  },
  (t) => [
    foreignKey({
      name: 'initiative_subscribers_initiative_tenant_fk',
      columns: [t.workspaceId, t.initiativeId],
      foreignColumns: [initiatives.workspaceId, initiatives.id],
    }),
    foreignKey({
      name: 'initiative_subscribers_member_tenant_fk',
      columns: [t.workspaceId, t.membershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    uniqueIndex('initiative_subscribers_member_idx').on(
      t.initiativeId,
      t.membershipId,
    ),
  ],
);
