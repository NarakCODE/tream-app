import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
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
    uniqueIndex('teams_workspace_key_active_idx')
      .on(table.workspaceId, table.key)
      .where(sql`${table.retiredAt} is null`),
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('issue_statuses_team_name_idx').on(table.teamId, table.name),
    uniqueIndex('issue_statuses_team_position_idx').on(
      table.teamId,
      table.position,
    ),
    index('issue_statuses_team_id_idx').on(table.teamId),
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
    uniqueIndex('project_teams_project_team_idx').on(
      table.projectId,
      table.teamId,
    ),
    index('project_teams_project_id_idx').on(table.projectId),
    index('project_teams_team_id_idx').on(table.teamId),
  ],
);

export const cycles = pgTable(
  'cycles',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
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
