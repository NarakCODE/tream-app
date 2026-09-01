import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth.schema';
import { workspaces } from './workspace.schema';

export const integrationProvider = pgEnum('integration_provider', ['gmail']);

export const integrationStatus = pgEnum('integration_status', [
  'ACTIVE',
  'EXPIRED',
  'REVOKED',
]);

export const integrations = pgTable(
  'integrations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    provider: integrationProvider('provider').notNull(),
    accountEmail: text('account_email').notNull(),
    encryptedTokens: text('encrypted_tokens').notNull(),
    grantedScopes: text('granted_scopes').array().notNull().default([]),
    status: integrationStatus('status').notNull().default('ACTIVE'),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('integrations_workspace_provider_account_idx').on(
      table.workspaceId,
      table.provider,
      table.accountEmail,
    ),
    index('integrations_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
  ],
);

export const integrationOauthStates = pgTable(
  'integration_oauth_states',
  {
    stateHash: text('state_hash').primaryKey(),
    integrationId: text('integration_id').notNull(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    initiatedBy: text('initiated_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    encryptedCodeVerifier: text('encrypted_code_verifier').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('integration_oauth_states_expiry_idx').on(table.expiresAt),
    index('integration_oauth_states_workspace_idx').on(table.workspaceId),
  ],
);
