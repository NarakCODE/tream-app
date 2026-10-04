import { sql } from 'drizzle-orm';
import type { DemoContext } from './context';

// Child-first order. The files->origin attachment FK is deferred by migration 0022.
// Identity and the workspace itself are intentionally retained.
export const demoTables = [
  'notification_delivery_jobs',
  'notifications',
  'notification_preferences',
  'event_dispatch_attempts',
  'event_consumer_receipts',
  'event_aggregate_heads',
  'storage_cleanup_jobs',
  'attachments',
  'files',
  'favorites',
  'saved_views',
  'dynamic_records',
  'dynamic_fields',
  'dynamic_databases',
  'tasks',
  'deal_contacts',
  'deals',
  'contacts',
  'companies',
  'issue_activity',
  'comment_reactions',
  'comments',
  'issue_templates',
  'issue_labels',
  'project_labels',
  'issue_subscribers',
  'project_subscribers',
  'initiative_subscribers',
  'documents',
  'initiative_updates',
  'initiative_projects',
  'initiatives',
  'cycle_rollovers',
  'issue_relations',
  'issue_identifiers',
  'issues',
  'cycles',
  'project_updates',
  'project_milestones',
  'project_members',
  'project_teams',
  'projects',
  'project_statuses',
  'labels',
  'issue_statuses',
  'team_memberships',
  'teams',
  'audit_logs',
  'events',
  'workspace_invitations',
] as const;

function scope(table: string, workspaceId: string) {
  if (table === 'issue_statuses')
    return sql`team_id IN (SELECT id FROM teams WHERE workspace_id = ${workspaceId})`;
  if (table === 'dynamic_fields')
    return sql`database_id IN (SELECT id FROM dynamic_databases WHERE workspace_id = ${workspaceId})`;
  if (
    table === 'event_dispatch_attempts' ||
    table === 'event_consumer_receipts'
  )
    return sql`event_id IN (SELECT id FROM events WHERE workspace_id = ${workspaceId})`;
  return sql`workspace_id = ${workspaceId}`;
}

/** Development-only restoration of a tagged demo tenant, never a global truncate. */
export async function resetDemoDomain(ctx: DemoContext) {
  // Lifecycle and append-only guards intentionally forbid deleting production
  // facts. Restoring demo fixtures needs table-owner privileges. Transactional
  // table locks protect those guards while they are temporarily disabled; FK
  // constraints remain enabled. Any failure rolls back both data and trigger DDL.
  const tables = demoTables.map((name) => `"${name}"`).join(', ');
  await ctx.tx.execute(
    sql.raw(`LOCK TABLE ${tables} IN ACCESS EXCLUSIVE MODE`),
  );
  await ctx.tx.execute(sql.raw('SET CONSTRAINTS ALL DEFERRED'));
  const triggers: Array<{ table: string; name: string; enabled: string }> = [];
  for (const table of demoTables) {
    const result = await ctx.tx.execute<{ name: string; enabled: string }>(sql`
      SELECT t.tgname AS name, t.tgenabled AS enabled FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=${table} AND NOT t.tgisinternal AND t.tgenabled <> 'D'
    `);
    for (const trigger of result.rows) {
      triggers.push({ table, ...trigger });
      await ctx.tx.execute(
        sql`ALTER TABLE ${sql.identifier(table)} DISABLE TRIGGER ${sql.identifier(trigger.name)}`,
      );
    }
  }
  for (const name of demoTables.filter((name) => name !== 'project_statuses'))
    await ctx.tx.execute(
      sql`DELETE FROM ${sql.identifier(name)} WHERE ${scope(name, ctx.workspaceId)}`,
    );
  // Flush deferred origin-FK checks before changing trigger DDL.
  await ctx.tx.execute(sql.raw('SET CONSTRAINTS ALL IMMEDIATE'));
  for (const trigger of triggers) {
    const mode =
      trigger.enabled === 'A'
        ? 'ENABLE ALWAYS'
        : trigger.enabled === 'R'
          ? 'ENABLE REPLICA'
          : 'ENABLE';
    await ctx.tx.execute(
      sql`ALTER TABLE ${sql.identifier(trigger.table)} ${sql.raw(mode)} TRIGGER ${sql.identifier(trigger.name)}`,
    );
  }
  await ctx.tx.execute(sql.raw('SET CONSTRAINTS ALL DEFERRED'));
}

export async function countDemoRecords(ctx: DemoContext) {
  const counts: Record<string, number> = {};
  for (const name of demoTables) {
    const result = await ctx.tx.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM ${sql.identifier(name)} WHERE ${scope(name, ctx.workspaceId)}`,
    );
    counts[name] = Number(result.rows[0]?.count ?? 0);
  }
  for (const table of [
    'memberships',
    'workspaces',
    'users',
    'workspace_preferences',
    'workspace_selections',
  ]) {
    const condition =
      table === 'workspaces'
        ? sql`id = ${ctx.workspaceId}`
        : table === 'users'
          ? sql`id IN (SELECT user_id FROM memberships WHERE workspace_id = ${ctx.workspaceId})`
          : table === 'workspace_preferences'
            ? sql`membership_id IN (SELECT id FROM memberships WHERE workspace_id = ${ctx.workspaceId})`
            : sql`workspace_id = ${ctx.workspaceId}`;
    const result = await ctx.tx.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM ${sql.identifier(table)} WHERE ${condition}`,
    );
    counts[table] = Number(result.rows[0]?.count ?? 0);
  }
  return counts;
}
