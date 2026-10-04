import { sql } from 'drizzle-orm';
import { events } from './event.schema';
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { memberships, workspaces } from './workspace.schema';
import {
  issues,
  projects,
  projectUpdates,
  teams,
} from './work-management.schema';
const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
import { initiatives, initiativeUpdates } from './initiative.schema';
export const labels = pgTable(
  'labels',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    teamId: text('team_id'),
    name: text('name').notNull(),
    color: text('color').notNull(),
    description: text('description'),
    groupName: text('group_name'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    revision: integer('revision').default(1).notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('labels_workspace_identity_idx').on(t.workspaceId, t.id),
    foreignKey({
      name: 'labels_team_fk',
      columns: [t.workspaceId, t.teamId],
      foreignColumns: [teams.workspaceId, teams.id],
    }),
    uniqueIndex('labels_workspace_name_active_idx')
      .on(t.workspaceId, sql`lower(trim(${t.name}))`)
      .where(sql`${t.teamId} IS NULL AND ${t.archivedAt} IS NULL`),
    uniqueIndex('labels_team_name_active_idx')
      .on(t.teamId, sql`lower(trim(${t.name}))`)
      .where(sql`${t.teamId} IS NOT NULL AND ${t.archivedAt} IS NULL`),
    check('m09_label_name', sql`trim(${t.name}) <> ''`),
  ],
);
export const comments = pgTable(
  'comments',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    initiativeId: text('initiative_id'),
    initiativeUpdateId: text('initiative_update_id'),
    mentionedMembershipIds: jsonb('mention_membership_ids')
      .$type<string[]>()
      .default([])
      .notNull(),
    issueId: text('issue_id'),
    projectId: text('project_id'),
    projectUpdateId: text('project_update_id').references(
      () => projectUpdates.id,
    ),
    authorId: text('author_id').notNull(),
    parentCommentId: text('parent_comment_id').references(
      (): AnyPgColumn => comments.id,
    ),
    body: text('body').notNull(),
    revision: integer('revision').default(1).notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('comments_workspace_identity_idx').on(t.workspaceId, t.id),
    foreignKey({
      name: 'comments_initiative_update_tenant_fk',
      columns: [t.workspaceId, t.initiativeUpdateId],
      foreignColumns: [initiativeUpdates.workspaceId, initiativeUpdates.id],
    }),
    check(
      'm11_comment_mentions',
      sql`jsonb_typeof(${t.mentionedMembershipIds})='array' AND jsonb_array_length(${t.mentionedMembershipIds}) <= 50 AND octet_length(${t.mentionedMembershipIds}::text) <= 8192`,
    ),
    foreignKey({
      name: 'comments_initiative_tenant_fk',
      columns: [t.workspaceId, t.initiativeId],
      foreignColumns: [initiatives.workspaceId, initiatives.id],
    }),
    foreignKey({
      name: 'comments_issue_fk',
      columns: [t.workspaceId, t.issueId],
      foreignColumns: [issues.workspaceId, issues.id],
    }),
    foreignKey({
      name: 'comments_project_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      name: 'comments_update_tenant_fk',
      columns: [t.workspaceId, t.projectUpdateId],
      foreignColumns: [projectUpdates.workspaceId, projectUpdates.id],
    }),
    foreignKey({
      name: 'comments_author_fk',
      columns: [t.workspaceId, t.authorId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    foreignKey({
      name: 'comments_parent_fk',
      columns: [t.workspaceId, t.parentCommentId],
      foreignColumns: [t.workspaceId, t.id],
    }),
    check(
      'm09_comment_target',
      sql`num_nonnulls(${t.issueId},${t.projectId},${t.projectUpdateId},${t.initiativeId},${t.initiativeUpdateId}) = 1`,
    ),
    check('m09_comment_body', sql`trim(${t.body}) <> ''`),
    check('m09_comment_revision', sql`${t.revision} >= 1`),
    check(
      'm09_comment_parent_self',
      sql`${t.parentCommentId} IS NULL OR ${t.parentCommentId} <> ${t.id}`,
    ),
  ],
);
export const issueComments = comments;
export const issueLabels = pgTable(
  'issue_labels',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    issueId: text('issue_id').notNull(),
    labelId: text('label_id').notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: 'issue_labels_target_fk',
      columns: [t.workspaceId, t.issueId],
      foreignColumns: [issues.workspaceId, issues.id],
    }),
    foreignKey({
      name: 'issue_labels_link_fk',
      columns: [t.workspaceId, t.labelId],
      foreignColumns: [labels.workspaceId, labels.id],
    }),
    uniqueIndex('issue_labels_unique_idx').on(t.issueId, t.labelId),
  ],
);
export const projectLabels = pgTable(
  'project_labels',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    projectId: text('project_id').notNull(),
    labelId: text('label_id').notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: 'project_labels_target_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      name: 'project_labels_link_fk',
      columns: [t.workspaceId, t.labelId],
      foreignColumns: [labels.workspaceId, labels.id],
    }),
    uniqueIndex('project_labels_unique_idx').on(t.projectId, t.labelId),
  ],
);
export const issueSubscribers = pgTable(
  'issue_subscribers',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    issueId: text('issue_id').notNull(),
    membershipId: text('membership_id').notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: 'issue_subscribers_target_fk',
      columns: [t.workspaceId, t.issueId],
      foreignColumns: [issues.workspaceId, issues.id],
    }),
    foreignKey({
      name: 'issue_subscribers_link_fk',
      columns: [t.workspaceId, t.membershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    uniqueIndex('issue_subscribers_unique_idx').on(t.issueId, t.membershipId),
  ],
);
export const projectSubscribers = pgTable(
  'project_subscribers',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    projectId: text('project_id').notNull(),
    membershipId: text('membership_id').notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: 'project_subscribers_target_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      name: 'project_subscribers_link_fk',
      columns: [t.workspaceId, t.membershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    uniqueIndex('project_subscribers_unique_idx').on(
      t.projectId,
      t.membershipId,
    ),
  ],
);
export const commentReactions = pgTable(
  'comment_reactions',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    commentId: text('comment_id').notNull(),
    membershipId: text('membership_id').notNull(),
    emoji: text('emoji').notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: 'comment_reactions_comment_fk',
      columns: [t.workspaceId, t.commentId],
      foreignColumns: [comments.workspaceId, comments.id],
    }),
    foreignKey({
      name: 'comment_reactions_member_fk',
      columns: [t.workspaceId, t.membershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    uniqueIndex('comment_reactions_unique_idx').on(
      t.commentId,
      t.membershipId,
      t.emoji,
    ),
    check('m09_reaction_nonempty', sql`trim(${t.emoji}) <> ''`),
  ],
);
export const issueTemplates = pgTable(
  'issue_templates',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    teamId: text('team_id'),
    name: text('name').notNull(),
    description: text('description'),
    titleTemplate: text('title_template'),
    bodyTemplate: text('body_template'),
    defaults: jsonb('defaults')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdById: text('created_by_id').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    revision: integer('revision').default(1).notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: 'issue_templates_team_fk',
      columns: [t.workspaceId, t.teamId],
      foreignColumns: [teams.workspaceId, teams.id],
    }),
    foreignKey({
      name: 'issue_templates_author_fk',
      columns: [t.workspaceId, t.createdById],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    check('m09_template_name', sql`trim(${t.name}) <> ''`),
    check('m09_template_defaults', sql`jsonb_typeof(${t.defaults}) = 'object'`),
  ],
);
export const issueActivity = pgTable(
  'issue_activity',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    issueId: text('issue_id').notNull(),
    actorId: text('actor_id'),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    action: text('action').notNull(),
    changes: jsonb('changes').$type<Record<string, unknown>>().notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: 'issue_activity_issue_fk',
      columns: [t.workspaceId, t.issueId],
      foreignColumns: [issues.workspaceId, issues.id],
    }),
    foreignKey({
      name: 'issue_activity_actor_fk',
      columns: [t.workspaceId, t.actorId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    uniqueIndex('issue_activity_event_idx').on(t.issueId, t.eventId),
  ],
);
