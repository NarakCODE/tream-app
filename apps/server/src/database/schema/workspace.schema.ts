import { sql } from 'drizzle-orm';
import {
  index,
  check,
  foreignKey,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth.schema';

export const workspaceRole = pgEnum('workspace_role', [
  'OWNER',
  'ADMIN',
  'MEMBER',
  'GUEST',
]);

export const membershipState = pgEnum('membership_state', [
  'ACTIVE',
  'SUSPENDED',
  'LEFT',
]);

export const workspaces = pgTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    settings: jsonb('settings')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('workspaces_slug_idx').on(table.slug),
    check(
      'm14_workspace_purge_state',
      sql`${table.purgedAt} IS NULL OR (${table.deletedAt} IS NOT NULL AND ${table.archivedAt} IS NULL AND ${table.purgedAt} >= ${table.deletedAt} + interval '30 days')`,
    ),
    check(
      'workspace_lifecycle_exclusive',
      sql`${table.archivedAt} IS NULL OR ${table.deletedAt} IS NULL`,
    ),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull(),
    state: membershipState('state').default('ACTIVE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('memberships_workspace_user_idx').on(
      table.workspaceId,
      table.userId,
    ),
    uniqueIndex('memberships_workspace_id_id_idx').on(
      table.workspaceId,
      table.id,
    ),
    index('memberships_workspace_id_idx').on(table.workspaceId),
    index('memberships_user_id_idx').on(table.userId),
  ],
);

export const workspaceInvitations = pgTable(
  'workspace_invitations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    email: text('email').notNull(),
    role: workspaceRole('role').notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => memberships.id),
    acceptedBy: text('accepted_by').references(() => memberships.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: 'invitation_issuer_same_workspace_fk',
      columns: [table.workspaceId, table.invitedBy],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    foreignKey({
      name: 'invitation_acceptor_same_workspace_fk',
      columns: [table.workspaceId, table.acceptedBy],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    uniqueIndex('workspace_invitation_token_idx').on(table.tokenHash),
    uniqueIndex('workspace_invitation_pending_email_idx')
      .on(table.workspaceId, table.email)
      .where(sql`${table.acceptedAt} IS NULL AND ${table.revokedAt} IS NULL`),
    check(
      'workspace_invitation_normalized_email',
      sql`${table.email} = lower(trim(${table.email}))`,
    ),
    check(
      'workspace_invitation_terminal_exclusive',
      sql`${table.acceptedAt} IS NULL OR ${table.revokedAt} IS NULL`,
    ),
    check(
      'workspace_invitation_acceptance_pair',
      sql`(${table.acceptedAt} IS NULL) = (${table.acceptedBy} IS NULL)`,
    ),
    check(
      'workspace_invitation_expiry',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const workspacePreferences = pgTable('workspace_preferences', {
  membershipId: text('membership_id')
    .primaryKey()
    .references(() => memberships.id),
  preferences: jsonb('preferences')
    .$type<{ theme: 'system' | 'light' | 'dark'; timezone: string }>()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const workspaceSelections = pgTable('workspace_selections', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
