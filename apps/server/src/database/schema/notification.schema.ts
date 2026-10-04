import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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
import { events } from './event.schema';
import { issues, projects } from './work-management.schema';
import { initiatives } from './initiative.schema';
import { documents } from './document.schema';
export const notificationKind = pgEnum('notification_kind', [
  'ASSIGNMENT',
  'MENTION',
  'SUBSCRIPTION',
  'PLANNING_UPDATE',
]);
export const notificationChannel = pgEnum('notification_channel', [
  'IN_APP',
  'EMAIL',
]);
export const notificationDeliveryStatus = pgEnum(
  'notification_delivery_status',
  [
    'PENDING',
    'PROCESSING',
    'SENDING',
    'FAILED',
    'SUCCEEDED',
    'UNKNOWN',
    'SUPPRESSED',
    'DEAD',
  ],
);
const times = () => ({
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    recipientMembershipId: text('recipient_id').notNull(),
    actorMembershipId: text('actor_id'),
    eventId: text('event_id').notNull(),
    kind: notificationKind('kind').notNull(),
    issueId: text('issue_id'),
    projectId: text('project_id'),
    initiativeId: text('initiative_id'),
    documentId: text('document_id'),
    title: text('title'),
    body: text('body'),
    revision: integer('revision').default(1).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    ...times(),
  },
  (t) => [
    uniqueIndex('notifications_workspace_identity_idx').on(t.workspaceId, t.id),
    uniqueIndex('notifications_delivery_identity_idx').on(
      t.workspaceId,
      t.id,
      t.recipientMembershipId,
    ),
    uniqueIndex('notifications_event_recipient_kind_idx').on(
      t.eventId,
      t.recipientMembershipId,
      t.kind,
    ),
    foreignKey({
      name: 'notifications_recipient_tenant_fk',
      columns: [t.workspaceId, t.recipientMembershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    foreignKey({
      name: 'notifications_actor_tenant_fk',
      columns: [t.workspaceId, t.actorMembershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    foreignKey({
      name: 'notifications_event_tenant_fk',
      columns: [t.workspaceId, t.eventId],
      foreignColumns: [events.workspaceId, events.id],
    }),
    foreignKey({
      name: 'notifications_issue_tenant_fk',
      columns: [t.workspaceId, t.issueId],
      foreignColumns: [issues.workspaceId, issues.id],
    }),
    foreignKey({
      name: 'notifications_project_tenant_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      name: 'notifications_initiative_tenant_fk',
      columns: [t.workspaceId, t.initiativeId],
      foreignColumns: [initiatives.workspaceId, initiatives.id],
    }),
    foreignKey({
      name: 'notifications_document_tenant_fk',
      columns: [t.workspaceId, t.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
    }),
    check(
      'm13_notification_target',
      sql`num_nonnulls(${t.issueId},${t.projectId},${t.initiativeId},${t.documentId})<=1`,
    ),
    check(
      'm13_notification_title',
      sql`${t.title} IS NULL OR length(${t.title}) <= 500`,
    ),
    check(
      'm13_notification_body',
      sql`${t.body} IS NULL OR length(${t.body}) <= 10000`,
    ),
    check('m13_notification_revision', sql`${t.revision}>=1`),
    index('notifications_inbox_idx').on(
      t.workspaceId,
      t.recipientMembershipId,
      t.createdAt,
      t.id,
    ),
  ],
);
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    recipientMembershipId: text('recipient_id').notNull(),
    inAppEnabled: boolean('in_app_enabled').default(true).notNull(),
    emailEnabled: boolean('email_enabled').default(false).notNull(),
    revision: integer('revision').default(1).notNull(),
    ...times(),
  },
  (t) => [
    foreignKey({
      name: 'notification_preferences_member_tenant_fk',
      columns: [t.workspaceId, t.recipientMembershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    uniqueIndex('notification_preferences_member_idx').on(
      t.workspaceId,
      t.recipientMembershipId,
    ),
    check('m13_notification_preferences_revision', sql`${t.revision}>=1`),
  ],
);
export const notificationDeliveryJobs = pgTable(
  'notification_delivery_jobs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    notificationId: text('notification_id').notNull(),
    recipientMembershipId: text('recipient_id').notNull(),
    channel: notificationChannel('channel').default('EMAIL').notNull(),
    status: notificationDeliveryStatus('status').default('PENDING').notNull(),
    runAfter: timestamp('run_after', { withTimezone: true })
      .defaultNow()
      .notNull(),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    lockedBy: text('locked_by'),
    leaseToken: text('lease_token'),
    attemptCount: integer('attempt_count').default(0).notNull(),
    messageId: text('message_id').notNull(),
    providerReceipt: text('provider_receipt'),
    lastErrorCode: text('last_error_code'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...times(),
  },
  (t) => [
    foreignKey({
      name: 'notification_delivery_notification_tenant_fk',
      columns: [t.workspaceId, t.notificationId, t.recipientMembershipId],
      foreignColumns: [
        notifications.workspaceId,
        notifications.id,
        notifications.recipientMembershipId,
      ],
    }),
    uniqueIndex('notification_delivery_notification_channel_idx').on(
      t.notificationId,
      t.channel,
    ),
    uniqueIndex('notification_delivery_message_id_idx').on(t.messageId),
    check('m13_delivery_email_channel', sql`${t.channel}='EMAIL'`),
    check('m13_delivery_attempt_count', sql`${t.attemptCount}>=0`),
    check(
      'm13_delivery_lease',
      sql`(${t.status} IN ('PROCESSING','SENDING')) = (${t.leaseUntil} IS NOT NULL AND ${t.lockedBy} IS NOT NULL AND ${t.leaseToken} IS NOT NULL)`,
    ),
    check(
      'm13_delivery_sent',
      sql`(${t.status}='SUCCEEDED') = (${t.sentAt} IS NOT NULL)`,
    ),
    check(
      'm13_delivery_error_code',
      sql`${t.lastErrorCode} IS NULL OR ${t.lastErrorCode} ~ '^[A-Z0-9_]{1,100}$'`,
    ),
    index('notification_delivery_due_idx').on(
      t.status,
      t.runAfter,
      t.leaseUntil,
    ),
  ],
);
export const notificationDeliveries = notificationDeliveryJobs;
