import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { integrationEnvironment } from './helpers/integration-environment';

async function withRetainedPlanning(
  run: (pool: Pool, source: string) => Promise<void>,
) {
  const admin = new Pool({ connectionString: integrationEnvironment() });
  const name = `tream_test_planning_upgrade_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(integrationEnvironment());
  url.pathname = `/${name}`;
  const folder = await mkdtemp(join(tmpdir(), 'tream-planning-migration-'));
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    pool = new Pool({ connectionString: url.toString() });
    const source = resolve(__dirname, '../src/database/migrations');
    const journal = JSON.parse(
      await readFile(join(source, 'meta/_journal.json'), 'utf8'),
    ) as { entries: Array<{ idx: number; tag: string }> };
    journal.entries = journal.entries.filter((entry) => entry.idx <= 22);
    await mkdir(join(folder, 'meta'));
    await writeFile(
      join(folder, 'meta/_journal.json'),
      JSON.stringify(journal),
    );
    for (const entry of journal.entries) {
      await writeFile(
        join(folder, `${entry.tag}.sql`),
        await readFile(join(source, `${entry.tag}.sql`)),
      );
    }
    await migrate(drizzle(pool), { migrationsFolder: folder });
    await pool.query(`
      INSERT INTO users(id,email,full_name) VALUES
        ('legacy-owner','project-owner@example.test','Owner');
      INSERT INTO workspaces(id,name,slug) VALUES
        ('legacy-workspace','Legacy projects','legacy-projects');
      INSERT INTO memberships(id,workspace_id,user_id,role) VALUES
        ('legacy-owner-member','legacy-workspace','legacy-owner','OWNER');
      INSERT INTO teams(id,workspace_id,name,key,next_issue_number) VALUES
        ('legacy-team','legacy-workspace','Retained team','LEG',4);
      INSERT INTO team_memberships(id,workspace_id,team_id,membership_id,role) VALUES
        ('legacy-team-admin','legacy-workspace','legacy-team','legacy-owner-member','ADMIN');
      INSERT INTO issue_statuses(id,team_id,name,category,position,is_default) VALUES
        ('legacy-default','legacy-team','Todo','UNSTARTED',0,true),
        ('legacy-done','legacy-team','Done','COMPLETED',1,false);
    `);
    await run(pool, source);
  } finally {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
    await rm(folder, { recursive: true, force: true });
  }
}

async function seedLegacyWork(pool: Pool) {
  await pool.query(`
    INSERT INTO cycles(id,workspace_id,team_id,number,name,starts_at,ends_at) VALUES
      ('legacy-cycle','legacy-workspace','legacy-team',1,'Retained cycle','2026-01-01T00:00:00Z','2026-01-15T00:00:00Z');
    INSERT INTO issues(id,workspace_id,team_id,number,identifier,title,status_id,cycle_id,created_at,updated_at) VALUES
      ('legacy-issue','legacy-workspace','legacy-team',1,'LEG-1','Retained issue','legacy-default','legacy-cycle','2025-12-01T12:34:00Z','2025-12-02T12:34:00Z');
    INSERT INTO audit_logs(id,workspace_id,actor_id,action,target_type,target_id,metadata) VALUES
      ('legacy-issue-audit','legacy-workspace','legacy-owner-member','issue.created','issue','legacy-issue','{"source":"legacy"}');
  `);
}

describe('M11 through M14 retained schema upgrades', () => {
  it('preserves retained issues and facts while adding typed planning and permanent lifecycle metadata', async () => {
    await withRetainedPlanning(async (pool, source) => {
      await seedLegacyWork(pool);
      await pool.query(
        "INSERT INTO comments(id,workspace_id,issue_id,author_id,body) VALUES('discussion','legacy-workspace','legacy-issue','legacy-owner-member','Retained discussion')",
      );
      const tables = [
        'issues',
        'issue_identifiers',
        'comments',
        'audit_logs',
        'workspaces',
      ];
      const before = new Map<string, Record<string, unknown>[]>();
      for (const table of tables)
        before.set(
          table,
          (
            await pool.query<Record<string, unknown>>(
              `SELECT * FROM ${table} ORDER BY id`,
            )
          ).rows,
        );
      await migrate(drizzle(pool), { migrationsFolder: source });
      for (const table of tables) {
        const after = (
          await pool.query<Record<string, unknown>>(
            `SELECT * FROM ${table} ORDER BY id`,
          )
        ).rows;
        expect(after).toHaveLength(before.get(table)!.length);
        after.forEach((row, i) =>
          expect(row).toMatchObject(before.get(table)![i]!),
        );
      }
      expect(
        (
          await pool.query<{ mention_membership_ids: unknown }>(
            "SELECT mention_membership_ids FROM comments WHERE id='discussion'",
          )
        ).rows[0]!.mention_membership_ids,
      ).toEqual([]);
      expect(
        (
          await pool.query<{ purged_at: Date | null }>(
            "SELECT purged_at FROM workspaces WHERE id='legacy-workspace'",
          )
        ).rows[0]!.purged_at,
      ).toBeNull();
    });
  });
  it('enforces document ownership, thread scope, bounded view JSON and deferred favorite ordering', async () => {
    await withRetainedPlanning(async (pool, source) => {
      await seedLegacyWork(pool);
      await migrate(drizzle(pool), { migrationsFolder: source });
      await pool.query(
        "INSERT INTO initiatives(id,workspace_id,name,created_by_id) VALUES('initiative','legacy-workspace','Roadmap','legacy-owner-member'),('other','legacy-workspace','Other','legacy-owner-member')",
      );
      await expect(
        pool.query(
          "INSERT INTO documents(id,workspace_id,title,body,author_id,team_id,initiative_id) VALUES('bad','legacy-workspace','Title','','legacy-owner-member','legacy-team','initiative')",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm11_document_target',
      });
      await pool.query(
        "INSERT INTO documents(id,workspace_id,title,body,author_id,initiative_id) VALUES('document','legacy-workspace','Title','Body','legacy-owner-member','initiative')",
      );
      await expect(
        pool.query(
          "UPDATE documents SET initiative_id='other' WHERE id='document'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm11_resource_identity',
      });
      await pool.query(
        "UPDATE documents SET body='Edited' WHERE id='document'",
      );
      expect(
        (
          await pool.query<{ revision: number }>(
            "SELECT revision FROM documents WHERE id='document'",
          )
        ).rows[0]!.revision,
      ).toBe(2);
      await expect(
        pool.query("DELETE FROM documents WHERE id='document'"),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm11_resource_retention',
      });
      await pool.query(
        "INSERT INTO comments(id,workspace_id,initiative_id,author_id,body) VALUES('initiative-comment','legacy-workspace','initiative','legacy-owner-member','Planning comment')",
      );
      await expect(
        pool.query(
          "INSERT INTO comments(id,workspace_id,initiative_id,parent_comment_id,author_id,body) VALUES('wrong-reply','legacy-workspace','other','initiative-comment','legacy-owner-member','Wrong thread')",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm09_comment_parent_target',
      });
      await expect(
        pool.query(
          "INSERT INTO saved_views(id,workspace_id,name,owner_id,resource,filters) VALUES('bad-view','legacy-workspace','View','legacy-owner-member','ISSUES','[]')",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm12_view_filters',
      });
      await pool.query(
        "INSERT INTO favorites(id,workspace_id,membership_id,issue_id,team_id,position) VALUES('issue-favorite','legacy-workspace','legacy-owner-member','legacy-issue',NULL,0),('team-favorite','legacy-workspace','legacy-owner-member',NULL,'legacy-team',1)",
      );
      await pool.query(
        "UPDATE favorites SET position=CASE WHEN id='issue-favorite' THEN 1 ELSE 0 END WHERE workspace_id='legacy-workspace'",
      );
      expect(
        (
          await pool.query<{ revision: number }>(
            'SELECT revision FROM favorites',
          )
        ).rows.map((r) => r.revision),
      ).toEqual([2, 2]);
    });
  });
  it('protects notification delivery identity, tenant facts and durable uncertain SMTP state', async () => {
    await withRetainedPlanning(async (pool, source) => {
      await seedLegacyWork(pool);
      await migrate(drizzle(pool), { migrationsFolder: source });
      await pool.query(
        "INSERT INTO events(id,workspace_id,event_type,payload) VALUES('source-event','legacy-workspace','issue.updated','{}')",
      );
      await pool.query(
        "INSERT INTO notifications(id,workspace_id,recipient_id,event_id,kind,issue_id) VALUES('notification','legacy-workspace','legacy-owner-member','source-event','SUBSCRIPTION','legacy-issue')",
      );
      await expect(
        pool.query(
          "INSERT INTO notifications(id,workspace_id,recipient_id,event_id,kind,issue_id) VALUES('duplicate','legacy-workspace','legacy-owner-member','source-event','SUBSCRIPTION','legacy-issue')",
        ),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'notifications_event_recipient_kind_idx',
      });
      await pool.query(
        "INSERT INTO notification_delivery_jobs(id,workspace_id,notification_id,recipient_id,message_id) VALUES('delivery','legacy-workspace','notification','legacy-owner-member','stable-message-id')",
      );
      await expect(
        pool.query(
          "UPDATE notification_delivery_jobs SET status='PROCESSING' WHERE id='delivery'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm13_delivery_lease',
      });
      await pool.query(
        "UPDATE notification_delivery_jobs SET status='SENDING',lease_until=now()+interval '1 minute',locked_by='worker',lease_token='token',attempt_count=1 WHERE id='delivery'",
      );
      await pool.query(
        "UPDATE notification_delivery_jobs SET status='UNKNOWN',lease_until=NULL,locked_by=NULL,lease_token=NULL,last_error_code='SMTP_UNCERTAIN' WHERE id='delivery'",
      );
      await expect(
        pool.query(
          "UPDATE notification_delivery_jobs SET message_id='changed' WHERE id='delivery'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm13_delivery_identity',
      });
      await expect(
        pool.query(
          "DELETE FROM notification_delivery_jobs WHERE id='delivery'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm13_delivery_retention',
      });
      await expect(
        pool.query("DELETE FROM notifications WHERE id='notification'"),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm13_notification_retention',
      });
    });
  });
  it('guards permanent workspace purge metadata without bypassing append-only facts', async () => {
    await withRetainedPlanning(async (pool, source) => {
      await seedLegacyWork(pool);
      await migrate(drizzle(pool), { migrationsFolder: source });
      await expect(
        pool.query(
          "UPDATE workspaces SET purged_at=now() WHERE id='legacy-workspace'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm14_workspace_purge_state',
      });
      await pool.query(
        "UPDATE workspaces SET deleted_at=now()-interval '31 days',purged_at=now() WHERE id='legacy-workspace'",
      );
      await expect(
        pool.query(
          "UPDATE workspaces SET deleted_at=NULL,purged_at=NULL WHERE id='legacy-workspace'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm14_workspace_purge_immutable',
      });
      await expect(
        pool.query(
          "UPDATE audit_logs SET correlation_id='retroactive' WHERE id='legacy-issue-audit'",
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });
});
