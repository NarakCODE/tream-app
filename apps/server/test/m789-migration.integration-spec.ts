import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { integrationEnvironment } from './helpers/integration-environment';

async function withLegacyWork(
  run: (pool: Pool, source: string) => Promise<void>,
) {
  const admin = new Pool({ connectionString: integrationEnvironment() });
  const name = `tream_test_work_upgrade_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(integrationEnvironment());
  url.pathname = `/${name}`;
  const folder = await mkdtemp(join(tmpdir(), 'tream-work-migration-'));
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    pool = new Pool({ connectionString: url.toString() });
    const source = resolve(__dirname, '../src/database/migrations');
    const journal = JSON.parse(
      await readFile(join(source, 'meta/_journal.json'), 'utf8'),
    ) as { entries: Array<{ idx: number; tag: string }> };
    journal.entries = journal.entries.filter((entry) => entry.idx <= 14);
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
    INSERT INTO cycles(id,team_id,number,name,starts_at,ends_at) VALUES
      ('legacy-cycle','legacy-team',1,'Retained cycle','2026-01-01T00:00:00Z','2026-01-15T00:00:00Z');
    INSERT INTO issues(id,workspace_id,team_id,number,identifier,title,status_id,cycle_id,created_at,updated_at) VALUES
      ('legacy-issue','legacy-workspace','legacy-team',1,'LEG-1','Retained issue','legacy-default','legacy-cycle','2025-12-01T12:34:00Z','2025-12-02T12:34:00Z');
    INSERT INTO audit_logs(id,workspace_id,actor_id,action,target_type,target_id,metadata) VALUES
      ('legacy-issue-audit','legacy-workspace','legacy-owner-member','issue.created','issue','legacy-issue','{"source":"legacy"}');
  `);
}

describe('retained M07 M08 M09 database upgrades', () => {
  it('preserves legacy issue work and facts while backfilling aliases, revisions and cycle scope', async () => {
    await withLegacyWork(async (pool, source) => {
      await seedLegacyWork(pool);
      const before = await pool.query<Record<string, unknown>>(
        'SELECT * FROM issues WHERE id=$1',
        ['legacy-issue'],
      );
      const audit = await pool.query<Record<string, unknown>>(
        'SELECT * FROM audit_logs ORDER BY id',
      );
      await migrate(drizzle(pool), { migrationsFolder: source });
      const after = await pool.query<Record<string, unknown>>(
        'SELECT * FROM issues WHERE id=$1',
        ['legacy-issue'],
      );
      expect(after.rows[0]).toMatchObject(before.rows[0]!);
      expect(after.rows[0]).toMatchObject({
        revision: 1,
        archived_at: null,
        parent_id: null,
        created_by_id: null,
      });
      const aliases = await pool.query<Record<string, unknown>>(
        'SELECT workspace_id,issue_id,identifier,is_current FROM issue_identifiers',
      );
      expect(aliases.rows).toEqual([
        {
          workspace_id: 'legacy-workspace',
          issue_id: 'legacy-issue',
          identifier: 'LEG-1',
          is_current: true,
        },
      ]);
      const cycles = await pool.query<Record<string, unknown>>(
        'SELECT workspace_id,revision,started_at,canceled_at FROM cycles',
      );
      expect(cycles.rows).toEqual([
        {
          workspace_id: 'legacy-workspace',
          revision: 1,
          started_at: null,
          canceled_at: null,
        },
      ]);
      expect(
        (
          await pool.query<Record<string, unknown>>(
            'SELECT * FROM audit_logs ORDER BY id',
          )
        ).rows,
      ).toEqual(audit.rows);
      for (const table of [
        'comments',
        'comment_reactions',
        'labels',
        'issue_labels',
        'issue_relations',
        'issue_subscribers',
        'project_subscribers',
        'cycle_rollovers',
        'issue_activity',
      ]) {
        expect(
          Number(
            (
              await pool.query<{ count: string }>(
                `SELECT count(*) FROM ${table}`,
              )
            ).rows[0]!.count,
          ),
        ).toBe(0);
      }
      await expect(
        pool.query("DELETE FROM issue_identifiers WHERE identifier='LEG-1'"),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm07_identifier_immutable',
      });
      await expect(
        pool.query(
          "UPDATE issue_identifiers SET is_current=false WHERE identifier='LEG-1'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm07_identifier_current',
      });
    });
  });

  it('allows adjacent retained cycle windows and rejects overlaps without rewriting historical work', async () => {
    await withLegacyWork(async (pool, source) => {
      await seedLegacyWork(pool);
      await pool.query(
        "INSERT INTO cycles(id,team_id,number,name,starts_at,ends_at) VALUES('adjacent','legacy-team',2,'Adjacent','2026-01-15T00:00:00Z','2026-01-29T00:00:00Z')",
      );
      await migrate(drizzle(pool), { migrationsFolder: source });
      expect((await pool.query('SELECT id FROM cycles')).rows).toHaveLength(2);
    });
    await withLegacyWork(async (pool, source) => {
      await seedLegacyWork(pool);
      await pool.query(
        "INSERT INTO cycles(id,team_id,number,name,starts_at,ends_at) VALUES('overlap','legacy-team',2,'Overlap','2026-01-14T00:00:00Z','2026-01-28T00:00:00Z')",
      );
      const before = await pool.query<Record<string, unknown>>(
        'SELECT * FROM cycles ORDER BY id',
      );
      await expect(
        migrate(drizzle(pool), { migrationsFolder: source }),
      ).rejects.toBeDefined();
      expect(
        (
          await pool.query<Record<string, unknown>>(
            'SELECT * FROM cycles ORDER BY id',
          )
        ).rows,
      ).toEqual(before.rows);
      expect(
        (
          await pool.query<{ table: string | null }>(
            "SELECT to_regclass('issue_identifiers')::text AS table",
          )
        ).rows[0]!.table,
      ).toBeNull();
      expect((await pool.query('SELECT * FROM issues')).rows).toHaveLength(1);
    });
  });

  it('rejects retained issues assigned to another team cycle without silently clearing the association', async () => {
    await withLegacyWork(async (pool, source) => {
      await seedLegacyWork(pool);
      await pool.query(`
        INSERT INTO teams(id,workspace_id,name,key) VALUES('other-team','legacy-workspace','Other','OTH');
        INSERT INTO team_memberships(id,workspace_id,team_id,membership_id,role) VALUES('other-admin','legacy-workspace','other-team','legacy-owner-member','ADMIN');
        INSERT INTO issue_statuses(id,team_id,name,category,position,is_default) VALUES('other-default','other-team','Todo','UNSTARTED',0,true);
        INSERT INTO cycles(id,team_id,number,name,starts_at,ends_at) VALUES('other-cycle','other-team',1,'Other','2026-01-01T00:00:00Z','2026-01-15T00:00:00Z');
        UPDATE issues SET cycle_id='other-cycle' WHERE id='legacy-issue';
      `);
      await expect(
        migrate(drizzle(pool), { migrationsFolder: source }),
      ).rejects.toBeDefined();
      expect(
        (
          await pool.query<{ cycle_id: string }>(
            "SELECT cycle_id FROM issues WHERE id='legacy-issue'",
          )
        ).rows[0]!.cycle_id,
      ).toBe('other-cycle');
      expect(
        (
          await pool.query<{ table: string | null }>(
            "SELECT to_regclass('issue_identifiers')::text AS table",
          )
        ).rows[0]!.table,
      ).toBeNull();
    });
  });
  it('rejects noncanonical legacy identifiers without changing the old identifier or facts', async () => {
    await withLegacyWork(async (pool, source) => {
      await seedLegacyWork(pool);
      await pool.query(
        "UPDATE issues SET identifier='OLD-CUSTOM' WHERE id='legacy-issue'",
      );
      const facts = await pool.query<Record<string, unknown>>(
        'SELECT * FROM audit_logs ORDER BY id',
      );
      await expect(
        migrate(drizzle(pool), { migrationsFolder: source }),
      ).rejects.toBeDefined();
      expect(
        (
          await pool.query<{ identifier: string }>(
            "SELECT identifier FROM issues WHERE id='legacy-issue'",
          )
        ).rows[0]!.identifier,
      ).toBe('OLD-CUSTOM');
      expect(
        (
          await pool.query<Record<string, unknown>>(
            'SELECT * FROM audit_logs ORDER BY id',
          )
        ).rows,
      ).toEqual(facts.rows);
      expect(
        (
          await pool.query<{ table: string | null }>(
            "SELECT to_regclass('issue_identifiers')::text AS table",
          )
        ).rows[0]!.table,
      ).toBeNull();
    });
  });
});
