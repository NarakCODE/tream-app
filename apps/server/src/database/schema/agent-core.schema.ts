import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth.schema';
import { workspaces } from './workspace.schema';

export const agentApprovalPolicy = pgEnum('agent_approval_policy', [
  'NONE',
  'EXTERNAL_ACTIONS',
  'EVERY_WRITE',
  'ALWAYS',
]);
export const agentTriggerType = pgEnum('agent_trigger_type', [
  'EVENT',
  'SCHEDULE',
]);
export const agentRunStatus = pgEnum('agent_run_status', [
  'QUEUED',
  'RUNNING',
  'WAITING_FOR_APPROVAL',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
]);
export const agentApprovalStatus = pgEnum('agent_approval_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
]);
export const agentRunJobStatus = pgEnum('agent_run_job_status', [
  'PENDING',
  'CLAIMED',
  'COMPLETED',
  'FAILED',
]);

export interface AgentConfigurationSnapshot {
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  approvalPolicy: 'NONE' | 'EXTERNAL_ACTIONS' | 'EVERY_WRITE' | 'ALWAYS';
  skillPermissions: string[];
}

export const agents = pgTable(
  'agents',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    systemPrompt: text('system_prompt').notNull(),
    model: text('model').default('gpt-4o').notNull(),
    approvalPolicy: agentApprovalPolicy('approval_policy')
      .default('EXTERNAL_ACTIONS')
      .notNull(),
    skillPermissions: jsonb('skill_permissions')
      .$type<string[]>()
      .default([])
      .notNull(),
    isEnabled: boolean('is_enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('agents_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const agentTriggers = pgTable(
  'agent_triggers',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    type: agentTriggerType('type').notNull(),
    eventType: text('event_type'),
    cronExpression: text('cron_expression'),
    integrationId: text('integration_id'),
    isEnabled: boolean('is_enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'agent_trigger_shape_check',
      sql`(${table.type} = 'EVENT' and ${table.eventType} is not null and ${table.cronExpression} is null) or (${table.type} = 'SCHEDULE' and ${table.cronExpression} is not null and ${table.eventType} is null)`,
    ),
    index('agent_triggers_agent_idx').on(table.agentId, table.createdAt),
  ],
);

export const triggerConditions = pgTable(
  'trigger_conditions',
  {
    id: text('id').primaryKey(),
    triggerId: text('trigger_id')
      .notNull()
      .references(() => agentTriggers.id, { onDelete: 'cascade' }),
    field: text('field').notNull(),
    operator: text('operator').notNull(),
    value: jsonb('value').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('trigger_conditions_trigger_idx').on(
      table.triggerId,
      table.createdAt,
    ),
  ],
);

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'restrict' }),
    triggerId: text('trigger_id').references(() => agentTriggers.id, {
      onDelete: 'set null',
    }),
    status: agentRunStatus('status').default('QUEUED').notNull(),
    inputContext: jsonb('input_context')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    configurationSnapshot: jsonb('configuration_snapshot')
      .$type<AgentConfigurationSnapshot>()
      .notNull(),
    outputSummary: text('output_summary'),
    failureCode: text('failure_code'),
    tokenUsage: jsonb('token_usage')
      .$type<{
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      }>()
      .default({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })
      .notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('agent_runs_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
    index('agent_runs_agent_status_idx').on(
      table.agentId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const agentRunJobs = pgTable(
  'agent_run_jobs',
  {
    runId: text('run_id')
      .primaryKey()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    status: agentRunJobStatus('status').default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('agent_run_jobs_dispatch_idx').on(table.status, table.availableAt),
  ],
);

export const agentRunSteps = pgTable(
  'agent_run_steps',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    stepNumber: integer('step_number').notNull(),
    type: text('type').notNull(),
    summary: text('summary'),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('agent_run_steps_run_number_idx').on(
      table.runId,
      table.stepNumber,
    ),
  ],
);

export const agentToolCalls = pgTable(
  'agent_tool_calls',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    stepId: text('step_id').references(() => agentRunSteps.id, {
      onDelete: 'set null',
    }),
    toolName: text('tool_name').notNull(),
    input: jsonb('input').$type<unknown>().notNull(),
    output: jsonb('output').$type<unknown>(),
    status: text('status').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('agent_tool_calls_run_idx').on(table.runId, table.createdAt),
  ],
);

export const agentRunLogs = pgTable(
  'agent_run_logs',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    level: text('level').notNull(),
    eventType: text('event_type').notNull(),
    message: text('message').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('agent_run_logs_run_created_idx').on(
      table.runId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const approvals = pgTable(
  'approvals',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    stepId: text('step_id').references(() => agentRunSteps.id, {
      onDelete: 'set null',
    }),
    actionType: text('action_type').notNull(),
    toolName: text('tool_name').notNull(),
    input: jsonb('input').$type<unknown>().notNull(),
    diff: jsonb('diff').$type<unknown>(),
    status: agentApprovalStatus('status').default('PENDING').notNull(),
    decidedBy: text('decided_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    rejectionReason: text('rejection_reason'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('approvals_workspace_status_idx').on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
  ],
);
