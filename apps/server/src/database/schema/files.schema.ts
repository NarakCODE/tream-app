import { sql } from 'drizzle-orm';
import {
  bigint,
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
import { documents } from './document.schema';
import { comments } from './collaboration.schema';
import { issues, projects } from './work-management.schema';
import { memberships, workspaces } from './workspace.schema';

export const fileStatus = pgEnum('file_status', [
  'PENDING',
  'UPLOADED',
  'QUARANTINED',
  'READY',
  'DELETED',
  'PURGING',
  'PURGED',
  'EXPIRED',
]);
export const storageCleanupStatus = pgEnum('storage_cleanup_status', [
  'PENDING',
  'PROCESSING',
  'FAILED',
  'SUCCEEDED',
  'CANCELED',
]);
export const storageCleanupReason = pgEnum('storage_cleanup_reason', [
  'ABANDONED',
  'DELETED',
]);
const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const files = pgTable(
  'files',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    createdById: text('created_by_id').notNull(),
    // Cyclic composite origin FK is deferred in migration 0022.
    sourceAttachmentId: text('source_attachment_id').notNull(),
    storageKey: text('storage_key').notNull(),
    name: text('name').notNull(),
    declaredMimeType: text('declared_mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    actualSizeBytes: bigint('actual_size_bytes', { mode: 'number' }),
    actualMimeType: text('actual_mime_type'),
    actualSha256: text('actual_sha256'),
    status: fileStatus('status').default('PENDING').notNull(),
    revision: integer('revision').default(1).notNull(),
    uploadExpiresAt: timestamp('upload_expires_at', {
      withTimezone: true,
    }).notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    quarantinedAt: timestamp('quarantined_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    purgeAfter: timestamp('purge_after', { withTimezone: true }),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('files_workspace_identity_idx').on(t.workspaceId, t.id),
    uniqueIndex('files_storage_key_permanent_idx').on(t.storageKey),
    foreignKey({
      name: 'files_uploader_tenant_fk',
      columns: [t.workspaceId, t.createdById],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    check(
      'm10_file_storage_key',
      sql`${t.storageKey} ~ '^[A-Za-z0-9_-]{1,128}$'`,
    ),
    check(
      'm10_file_name',
      sql`trim(${t.name}) <> '' AND length(${t.name}) <= 255 AND ${t.name} !~ '[[:cntrl:]/]' AND position(chr(92) in ${t.name}) = 0`,
    ),
    check(
      'm10_file_size',
      sql`${t.sizeBytes} > 0 AND (${t.actualSizeBytes} IS NULL OR ${t.actualSizeBytes} >= 0)`,
    ),
    check(
      'm10_file_checksum',
      sql`${t.sha256} ~ '^[a-f0-9]{64}$' AND (${t.actualSha256} IS NULL OR ${t.actualSha256} ~ '^[a-f0-9]{64}$')`,
    ),
    check('m10_file_revision', sql`${t.revision} >= 1`),
    check(
      'm10_file_ready_metadata',
      sql`${t.status} <> 'READY' OR (${t.uploadedAt} IS NOT NULL AND ${t.readyAt} IS NOT NULL AND ${t.deletedAt} IS NULL AND ${t.actualSizeBytes} IS NOT NULL AND ${t.actualSizeBytes} = ${t.sizeBytes} AND ${t.actualSha256} IS NOT NULL AND ${t.actualSha256} = ${t.sha256} AND ${t.actualMimeType} IS NOT NULL AND ${t.actualMimeType} = ${t.declaredMimeType})`,
    ),
    check(
      'm10_file_lifecycle_timestamps',
      sql`(${t.status} <> 'UPLOADED' OR ${t.uploadedAt} IS NOT NULL) AND (${t.status} <> 'QUARANTINED' OR ${t.quarantinedAt} IS NOT NULL) AND (${t.status} <> 'DELETED' OR ${t.deletedAt} IS NOT NULL) AND (${t.status} <> 'PURGED' OR ${t.purgedAt} IS NOT NULL)`,
    ),
    index('files_workspace_history_idx').on(t.workspaceId, t.createdAt, t.id),
    index('files_abandoned_idx')
      .on(t.uploadExpiresAt)
      .where(sql`${t.status} IN ('PENDING','UPLOADED','QUARANTINED')`),
  ],
);

export const attachments = pgTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    fileId: text('file_id').notNull(),
    issueId: text('issue_id'),
    projectId: text('project_id'),
    commentId: text('comment_id'),
    documentId: text('document_id'),
    createdById: text('created_by_id').notNull(),
    revision: integer('revision').default(1).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('attachments_workspace_identity_idx').on(t.workspaceId, t.id),
    uniqueIndex('attachments_file_identity_idx').on(
      t.workspaceId,
      t.fileId,
      t.id,
    ),
    foreignKey({
      name: 'attachments_file_tenant_fk',
      columns: [t.workspaceId, t.fileId],
      foreignColumns: [files.workspaceId, files.id],
    }),
    foreignKey({
      name: 'attachments_issue_tenant_fk',
      columns: [t.workspaceId, t.issueId],
      foreignColumns: [issues.workspaceId, issues.id],
    }),
    foreignKey({
      name: 'attachments_project_tenant_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      name: 'attachments_document_tenant_fk',
      columns: [t.workspaceId, t.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
    }),
    foreignKey({
      name: 'attachments_comment_tenant_fk',
      columns: [t.workspaceId, t.commentId],
      foreignColumns: [comments.workspaceId, comments.id],
    }),
    foreignKey({
      name: 'attachments_author_tenant_fk',
      columns: [t.workspaceId, t.createdById],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    check(
      'm10_attachment_target',
      sql`num_nonnulls(${t.issueId},${t.projectId},${t.commentId},${t.documentId}) = 1`,
    ),
    check('m10_attachment_revision', sql`${t.revision} >= 1`),
    uniqueIndex('attachments_issue_active_idx')
      .on(t.fileId, t.issueId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.issueId} IS NOT NULL`),
    uniqueIndex('attachments_project_active_idx')
      .on(t.fileId, t.projectId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.projectId} IS NOT NULL`),
    uniqueIndex('attachments_comment_active_idx')
      .on(t.fileId, t.commentId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.commentId} IS NOT NULL`),
    uniqueIndex('attachments_document_active_idx')
      .on(t.fileId, t.documentId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.documentId} IS NOT NULL`),
    index('attachments_workspace_history_idx').on(
      t.workspaceId,
      t.createdAt,
      t.id,
    ),
  ],
);

export const storageCleanupJobs = pgTable(
  'storage_cleanup_jobs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    fileId: text('file_id').notNull(),
    storageKey: text('storage_key').notNull(),
    reason: storageCleanupReason('reason').notNull(),
    status: storageCleanupStatus('status').default('PENDING').notNull(),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lockedBy: text('locked_by'),
    attemptCount: integer('attempt_count').default(0).notNull(),
    lastError: text('last_error'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: 'storage_cleanup_file_tenant_fk',
      columns: [t.workspaceId, t.fileId],
      foreignColumns: [files.workspaceId, files.id],
    }),
    uniqueIndex('storage_cleanup_active_file_idx')
      .on(t.fileId)
      .where(sql`${t.status} IN ('PENDING','PROCESSING','FAILED')`),
    check('m10_cleanup_attempt_count', sql`${t.attemptCount} >= 0`),
    check(
      'm10_cleanup_lease',
      sql`${t.status} <> 'PROCESSING' OR (${t.lockedUntil} IS NOT NULL AND ${t.lockedBy} IS NOT NULL)`,
    ),
    index('storage_cleanup_due_idx').on(t.status, t.runAfter, t.lockedUntil),
  ],
);
