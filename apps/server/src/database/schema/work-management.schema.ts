import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  check,
  index,
  foreignKey,
  integer,
  type AnyPgColumn,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { memberships, workspaces } from './workspace.schema';

export const workPriority = pgEnum('work_priority', [
  'NO_PRIORITY',
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
]);

export const issueStatusCategory = pgEnum('issue_status_category', [
  'BACKLOG',
  'UNSTARTED',
  'STARTED',
  'COMPLETED',
  'CANCELED',
  'DUPLICATE',
]);

export const projectStatus = pgEnum('project_status', [
  'PLANNED',
  'STARTED',
  'PAUSED',
  'COMPLETED',
  'CANCELED',
]);

export const teamVisibility = pgEnum('team_visibility', [
  'WORKSPACE',
  'PRIVATE',
]);
export const teamMemberRole = pgEnum('team_member_role', ['ADMIN', 'MEMBER']);

export const teams = pgTable(
  'teams',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    key: text('key').notNull(),
    description: text('description'),
    visibility: teamVisibility('visibility').default('WORKSPACE').notNull(),
    timezone: text('timezone').default('UTC').notNull(),
    cycleDurationWeeks: integer('cycle_duration_weeks').default(2).notNull(),
    cycleStartDay: integer('cycle_start_day').default(1).notNull(),
    cycleCooldownDays: integer('cycle_cooldown_days').default(0).notNull(),
    upcomingCyclesCount: integer('upcoming_cycles_count').default(3).notNull(),
    cyclesEnabled: boolean('cycles_enabled').default(false).notNull(),
    nextIssueNumber: integer('next_issue_number').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (table) => [
    check('teams_next_issue_number_check', sql`${table.nextIssueNumber} >= 1`),
    uniqueIndex('teams_workspace_key_permanent_idx').on(
      table.workspaceId,
      table.key,
    ),
    uniqueIndex('teams_workspace_identity_idx').on(table.workspaceId, table.id),
    check(
      'teams_canonical_key_check',
      sql`${table.key} ~ '^[A-Z][A-Z0-9]{1,9}$'`,
    ),
    check(
      'teams_cycle_settings_check',
      sql`${table.cycleDurationWeeks} BETWEEN 1 AND 8 AND ${table.cycleStartDay} BETWEEN 0 AND 6 AND ${table.cycleCooldownDays} BETWEEN 0 AND 14 AND ${table.cycleCooldownDays} < ${table.cycleDurationWeeks} * 7 AND ${table.upcomingCyclesCount} BETWEEN 1 AND 10`,
    ),
    index('teams_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
    index('teams_workspace_retired_idx').on(table.workspaceId, table.retiredAt),
  ],
);

export const teamMemberships = pgTable(
  'team_memberships',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    role: teamMemberRole('role').default('MEMBER').notNull(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    membershipId: text('membership_id')
      .notNull()
      .references(() => memberships.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: 'team_memberships_team_tenant_fk',
      columns: [table.workspaceId, table.teamId],
      foreignColumns: [teams.workspaceId, teams.id],
    }),
    foreignKey({
      name: 'team_memberships_member_tenant_fk',
      columns: [table.workspaceId, table.membershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    uniqueIndex('team_memberships_team_membership_idx').on(
      table.teamId,
      table.membershipId,
    ),
    index('team_memberships_team_id_idx').on(table.teamId),
    index('team_memberships_membership_id_idx').on(table.membershipId),
  ],
);

export const issueStatuses = pgTable(
  'issue_statuses',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: issueStatusCategory('category').notNull(),
    position: integer('position').notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('issue_statuses_team_name_active_idx')
      .on(table.teamId, sql`lower(trim(${table.name}))`)
      .where(sql`${table.retiredAt} IS NULL`),
    uniqueIndex('issue_statuses_team_position_idx')
      .on(table.teamId, table.position)
      .where(sql`${table.retiredAt} IS NULL`),
    uniqueIndex('issue_statuses_team_default_active_idx')
      .on(table.teamId)
      .where(sql`${table.isDefault} AND ${table.retiredAt} IS NULL`),
    uniqueIndex('issue_statuses_team_identity_idx').on(table.teamId, table.id),
    check('issue_statuses_position_check', sql`${table.position} >= 0`),
    check(
      'issue_statuses_default_usable_check',
      sql`NOT ${table.isDefault} OR (${table.retiredAt} IS NULL AND ${table.category} IN ('BACKLOG','UNSTARTED'))`,
    ),
    index('issue_statuses_team_id_idx').on(table.teamId),
  ],
);

export const updateHealth = pgEnum('update_health', [
  'ON_TRACK',
  'AT_RISK',
  'OFF_TRACK',
]);

export const projectStatuses = pgTable(
  'project_statuses',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    category: projectStatus('category').notNull(),
    color: text('color'),
    position: integer('position').notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('project_statuses_workspace_identity_idx').on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex('project_statuses_name_active_idx')
      .on(table.workspaceId, sql`lower(trim(${table.name}))`)
      .where(sql`${table.archivedAt} IS NULL`),
    uniqueIndex('project_statuses_position_active_idx')
      .on(table.workspaceId, table.position)
      .where(sql`${table.archivedAt} IS NULL`),
    uniqueIndex('project_statuses_default_active_idx')
      .on(table.workspaceId)
      .where(sql`${table.isDefault} AND ${table.archivedAt} IS NULL`),
    check('project_statuses_position_check', sql`${table.position} >= 0`),
    check('project_statuses_name_check', sql`trim(${table.name}) <> ''`),
    check(
      'project_statuses_default_usable_check',
      sql`NOT ${table.isDefault} OR (${table.archivedAt} IS NULL AND ${table.category} = 'PLANNED')`,
    ),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    summary: text('summary'),
    description: text('description'),
    status: projectStatus('status').default('PLANNED').notNull(),
    statusId: text('status_id').notNull(),
    createdById: text('created_by_id'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    priority: workPriority('priority').default('NO_PRIORITY').notNull(),
    leadId: text('lead_id').references(() => memberships.id, {
      onDelete: 'set null',
    }),
    startDate: timestamp('start_date', { withTimezone: true }),
    targetDate: timestamp('target_date', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('projects_workspace_identity_idx').on(
      table.workspaceId,
      table.id,
    ),
    foreignKey({
      name: 'projects_status_tenant_fk',
      columns: [table.workspaceId, table.statusId],
      foreignColumns: [projectStatuses.workspaceId, projectStatuses.id],
    }),
    foreignKey({
      name: 'projects_creator_tenant_fk',
      columns: [table.workspaceId, table.createdById],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    foreignKey({
      name: 'projects_lead_tenant_fk',
      columns: [table.workspaceId, table.leadId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    check('projects_name_check', sql`trim(${table.name}) <> ''`),
    check(
      'projects_lifecycle_exclusive',
      sql`${table.archivedAt} IS NULL OR ${table.deletedAt} IS NULL`,
    ),
    check(
      'projects_target_date_check',
      sql`${table.startDate} is null or ${table.targetDate} is null or ${table.targetDate} >= ${table.startDate}`,
    ),
    index('projects_workspace_created_active_idx')
      .on(table.workspaceId, table.createdAt, table.id)
      .where(sql`${table.deletedAt} is null`),
    index('projects_workspace_status_active_idx')
      .on(table.workspaceId, table.status, table.createdAt, table.id)
      .where(sql`${table.deletedAt} is null`),
    index('projects_workspace_lead_active_idx')
      .on(table.workspaceId, table.leadId, table.createdAt, table.id)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const projectTeams = pgTable(
  'project_teams',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: 'project_teams_project_tenant_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      name: 'project_teams_team_tenant_fk',
      columns: [table.workspaceId, table.teamId],
      foreignColumns: [teams.workspaceId, teams.id],
    }),
    uniqueIndex('project_teams_tenant_association_idx').on(
      table.workspaceId,
      table.projectId,
      table.teamId,
    ),
    uniqueIndex('project_teams_project_team_idx').on(
      table.projectId,
      table.teamId,
    ),
    index('project_teams_project_id_idx').on(table.projectId),
    index('project_teams_team_id_idx').on(table.teamId),
  ],
);

export const projectMembers = pgTable(
  'project_members',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    projectId: text('project_id').notNull(),
    membershipId: text('membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: 'project_members_project_tenant_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      name: 'project_members_member_tenant_fk',
      columns: [table.workspaceId, table.membershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    uniqueIndex('project_members_project_membership_idx').on(
      table.projectId,
      table.membershipId,
    ),
  ],
);

export const projectMilestones = pgTable(
  'project_milestones',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    targetDate: date('target_date'),
    position: integer('position').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: 'project_milestones_project_tenant_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    uniqueIndex('project_milestones_tenant_identity_idx').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('project_milestones_position_idx').on(
      table.projectId,
      table.position,
    ),
    check('project_milestones_position_check', sql`${table.position} >= 0`),
    check('project_milestones_name_check', sql`trim(${table.name}) <> ''`),
  ],
);

export const projectUpdates = pgTable(
  'project_updates',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    projectId: text('project_id').notNull(),
    authorId: text('author_id').notNull(),
    body: text('body').notNull(),
    health: updateHealth('health').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: 'project_updates_project_tenant_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      name: 'project_updates_author_tenant_fk',
      columns: [table.workspaceId, table.authorId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    uniqueIndex('project_updates_workspace_identity_idx').on(
      table.workspaceId,
      table.id,
    ),
    check('project_updates_body_check', sql`trim(${table.body}) <> ''`),
    index('project_updates_history_idx').on(
      table.projectId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const issueRelationType = pgEnum('issue_relation_type', [
  'BLOCKS',
  'RELATED',
  'DUPLICATES',
]);

export const cycles = pgTable(
  'cycles',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').notNull(),
    revision: integer('revision').default(1).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completionNextCycleId: text('completion_next_cycle_id'),
    schedulerError: text('scheduler_error'),
    schedulerFailedAt: timestamp('scheduler_failed_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    number: integer('number').notNull(),
    name: text('name').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('cycles_workspace_identity_idx').on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex('cycles_team_identity_idx').on(table.teamId, table.id),
    foreignKey({
      name: 'cycles_completion_target_fk',
      columns: [table.teamId, table.completionNextCycleId],
      foreignColumns: [table.teamId, table.id],
    }),
    check(
      'm08_cycle_completion_target',
      sql`${table.completionNextCycleId} IS NULL OR (${table.completionNextCycleId} <> ${table.id} AND ${table.completedAt} IS NOT NULL)`,
    ),
    foreignKey({
      name: 'cycles_team_tenant_fk',
      columns: [table.workspaceId, table.teamId],
      foreignColumns: [teams.workspaceId, teams.id],
    }),
    check('m08_cycle_revision', sql`${table.revision} >= 1`),
    check(
      'm08_cycle_terminal_exclusive',
      sql`${table.completedAt} IS NULL OR ${table.canceledAt} IS NULL`,
    ),
    check(
      'cycles_ends_after_starts_check',
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    uniqueIndex('cycles_team_number_idx').on(table.teamId, table.number),
    index('cycles_team_starts_at_idx').on(table.teamId, table.startsAt),
    index('cycles_team_completed_at_idx').on(table.teamId, table.completedAt),
  ],
);

export const issues = pgTable(
  'issues',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    identifier: text('identifier').notNull(),
    revision: integer('revision').default(1).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    parentId: text('parent_id').references((): AnyPgColumn => issues.id),
    createdById: text('created_by_id'),
    title: text('title').notNull(),
    description: text('description'),
    statusId: text('status_id')
      .notNull()
      .references(() => issueStatuses.id, { onDelete: 'restrict' }),
    priority: workPriority('priority').default('NO_PRIORITY').notNull(),
    assigneeId: text('assignee_id').references(() => memberships.id, {
      onDelete: 'set null',
    }),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    milestoneId: text('milestone_id'),
    cycleId: text('cycle_id').references(() => cycles.id, {
      onDelete: 'set null',
    }),
    dueDate: timestamp('due_date', { withTimezone: true }),
    estimate: integer('estimate'),
    sortOrder: integer('sort_order').default(0).notNull(),
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
      name: 'issues_project_team_tenant_fk',
      columns: [table.workspaceId, table.projectId, table.teamId],
      foreignColumns: [
        projectTeams.workspaceId,
        projectTeams.projectId,
        projectTeams.teamId,
      ],
    }),
    foreignKey({
      name: 'issues_milestone_project_fk',
      columns: [table.workspaceId, table.projectId, table.milestoneId],
      foreignColumns: [
        projectMilestones.workspaceId,
        projectMilestones.projectId,
        projectMilestones.id,
      ],
    }),
    check(
      'issues_milestone_requires_project',
      sql`${table.milestoneId} IS NULL OR ${table.projectId} IS NOT NULL`,
    ),
    uniqueIndex('issues_workspace_identity_idx').on(
      table.workspaceId,
      table.id,
    ),
    foreignKey({
      name: 'issues_assignee_tenant_fk',
      columns: [table.workspaceId, table.assigneeId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    foreignKey({
      name: 'issues_creator_tenant_fk',
      columns: [table.workspaceId, table.createdById],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    foreignKey({
      name: 'issues_cycle_team_fk',
      columns: [table.teamId, table.cycleId],
      foreignColumns: [cycles.teamId, cycles.id],
    }),
    foreignKey({
      name: 'issues_parent_tenant_fk',
      columns: [table.workspaceId, table.parentId],
      foreignColumns: [table.workspaceId, table.id],
    }),
    check('m07_issue_revision', sql`${table.revision} >= 1`),
    check(
      'm07_issue_lifecycle',
      sql`${table.archivedAt} IS NULL OR ${table.deletedAt} IS NULL`,
    ),
    check(
      'm07_issue_parent_self',
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`,
    ),
    check(
      'm07_issue_estimate',
      sql`${table.estimate} IS NULL OR ${table.estimate} >= 0`,
    ),
    check('m07_issue_title', sql`trim(${table.title}) <> ''`),
    check('issues_number_check', sql`${table.number} >= 1`),
    uniqueIndex('issues_team_number_idx').on(table.teamId, table.number),
    uniqueIndex('issues_workspace_identifier_idx').on(
      table.workspaceId,
      table.identifier,
    ),
    index('issues_workspace_created_active_idx')
      .on(table.workspaceId, table.createdAt, table.id)
      .where(sql`${table.deletedAt} is null`),
    index('issues_team_created_active_idx')
      .on(table.teamId, table.createdAt, table.id)
      .where(sql`${table.deletedAt} is null`),
    index('issues_workspace_team_active_idx')
      .on(table.workspaceId, table.teamId)
      .where(sql`${table.deletedAt} is null`),
    index('issues_project_active_idx')
      .on(table.projectId)
      .where(sql`${table.deletedAt} is null`),
    index('issues_cycle_active_idx')
      .on(table.cycleId)
      .where(sql`${table.deletedAt} is null`),
    index('issues_assignee_active_idx')
      .on(table.assigneeId)
      .where(sql`${table.deletedAt} is null`),
    index('issues_status_active_idx')
      .on(table.statusId)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const issueIdentifiers = pgTable(
  'issue_identifiers',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    issueId: text('issue_id').notNull(),
    identifier: text('identifier').notNull(),
    isCurrent: boolean('is_current').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    foreignKey({
      name: 'issue_identifiers_issue_tenant_fk',
      columns: [t.workspaceId, t.issueId],
      foreignColumns: [issues.workspaceId, issues.id],
    }),
    uniqueIndex('issue_identifiers_permanent_idx').on(
      t.workspaceId,
      t.identifier,
    ),
    uniqueIndex('issue_identifiers_current_idx')
      .on(t.issueId)
      .where(sql`${t.isCurrent}`),
  ],
);
export const issueRelations = pgTable(
  'issue_relations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    sourceIssueId: text('source_issue_id').notNull(),
    targetIssueId: text('target_issue_id').notNull(),
    type: issueRelationType('type').notNull(),
    createdById: text('created_by_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    foreignKey({
      name: 'issue_relations_source_fk',
      columns: [t.workspaceId, t.sourceIssueId],
      foreignColumns: [issues.workspaceId, issues.id],
    }),
    foreignKey({
      name: 'issue_relations_target_fk',
      columns: [t.workspaceId, t.targetIssueId],
      foreignColumns: [issues.workspaceId, issues.id],
    }),
    foreignKey({
      name: 'issue_relations_author_fk',
      columns: [t.workspaceId, t.createdById],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    uniqueIndex('issue_relations_pair_idx').on(
      t.workspaceId,
      t.sourceIssueId,
      t.targetIssueId,
      t.type,
    ),
    check('m07_relation_self', sql`${t.sourceIssueId} <> ${t.targetIssueId}`),
  ],
);
export const cycleRollovers = pgTable(
  'cycle_rollovers',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    teamId: text('team_id').notNull(),
    issueId: text('issue_id').notNull(),
    fromCycleId: text('from_cycle_id').notNull(),
    toCycleId: text('to_cycle_id').notNull(),
    rolledAt: timestamp('rolled_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    foreignKey({
      name: 'cycle_rollovers_issue_fk',
      columns: [t.workspaceId, t.issueId],
      foreignColumns: [issues.workspaceId, issues.id],
    }),
    foreignKey({
      name: 'cycle_rollovers_from_fk',
      columns: [t.teamId, t.fromCycleId],
      foreignColumns: [cycles.teamId, cycles.id],
    }),
    foreignKey({
      name: 'cycle_rollovers_to_fk',
      columns: [t.teamId, t.toCycleId],
      foreignColumns: [cycles.teamId, cycles.id],
    }),
    foreignKey({
      name: 'cycle_rollovers_team_fk',
      columns: [t.workspaceId, t.teamId],
      foreignColumns: [teams.workspaceId, teams.id],
    }),
    uniqueIndex('cycle_rollovers_once_idx').on(t.issueId, t.fromCycleId),
    check('m08_rollover_distinct', sql`${t.fromCycleId} <> ${t.toCycleId}`),
  ],
);
