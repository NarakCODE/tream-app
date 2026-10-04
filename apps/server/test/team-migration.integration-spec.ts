import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { integrationEnvironment } from './helpers/integration-environment';

async function withLegacyDatabase(
  run: (pool: Pool, source: string) => Promise<void>,
) {
  const base = integrationEnvironment();
  const admin = new Pool({ connectionString: base });
  const name = `tream_test_team_upgrade_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(base);
  url.pathname = `/${name}`;
  const folder = await mkdtemp(join(tmpdir(), 'tream-team-migration-'));
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    pool = new Pool({ connectionString: url.toString() });
    const source = resolve(__dirname, '../src/database/migrations');
    const journal = JSON.parse(
      await readFile(join(source, 'meta/_journal.json'), 'utf8'),
    ) as { entries: Array<{ idx: number; tag: string }> };
    journal.entries = journal.entries.filter((entry) => entry.idx <= 10);
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
    // The workspace and its owner must commit together under M04's guards.
    await pool.query(`
      INSERT INTO users(id,email,full_name) VALUES
        ('legacy-owner','owner@example.test','Owner'),
        ('legacy-user','member@example.test','Member');
      INSERT INTO workspaces(id,name,slug) VALUES('legacy-workspace','Legacy','legacy');
      INSERT INTO memberships(id,workspace_id,user_id,role) VALUES
        ('legacy-owner-member','legacy-workspace','legacy-owner','OWNER'),
        ('legacy-member','legacy-workspace','legacy-user','MEMBER');
    `);
    await run(pool, source);
  } finally {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
    await rm(folder, { recursive: true, force: true });
  }
}

describe('retained teams and workflow migration upgrade', () => {
  it('preserves identifiers and the usable default while backfilling tenant access and counters', async () => {
    await withLegacyDatabase(async (pool, source) => {
      await pool.query(`
        INSERT INTO teams(id,workspace_id,name,key) VALUES
          ('legacy-team','legacy-workspace','Legacy Team','LEG');
        INSERT INTO team_memberships(id,team_id,membership_id) VALUES
          ('legacy-team-member','legacy-team','legacy-member');
        INSERT INTO issue_statuses(id,team_id,name,category,position,is_default) VALUES
          ('legacy-default','legacy-team','Backlog','BACKLOG',0,true),
          ('legacy-ready','legacy-team','Ready','UNSTARTED',1,false),
          ('legacy-done','legacy-team','Done','COMPLETED',2,false);
        INSERT INTO issues(id,workspace_id,team_id,number,identifier,title,status_id) VALUES
          ('legacy-issue','legacy-workspace','legacy-team',7,'LEG-7','Retained issue','legacy-default');
      `);
      await migrate(drizzle(pool), { migrationsFolder: source });

      const team = await pool.query<{
        id: string;
        key: string;
        visibility: string;
        next_issue_number: number;
      }>('SELECT id,key,visibility,next_issue_number FROM teams');
      expect(team.rows).toEqual([
        {
          id: 'legacy-team',
          key: 'LEG',
          visibility: 'WORKSPACE',
          next_issue_number: 8,
        },
      ]);
      const members = await pool.query<{
        membership_id: string;
        workspace_id: string;
        role: string;
      }>(
        'SELECT membership_id,workspace_id,role FROM team_memberships ORDER BY membership_id',
      );
      expect(members.rows).toEqual([
        {
          membership_id: 'legacy-member',
          workspace_id: 'legacy-workspace',
          role: 'MEMBER',
        },
        {
          membership_id: 'legacy-owner-member',
          workspace_id: 'legacy-workspace',
          role: 'ADMIN',
        },
      ]);
      const defaults = await pool.query<{ id: string }>(
        'SELECT id FROM issue_statuses WHERE is_default AND retired_at IS NULL',
      );
      expect(defaults.rows).toEqual([{ id: 'legacy-default' }]);
      const issue = await pool.query<{
        id: string;
        number: number;
        identifier: string;
        status_id: string;
      }>('SELECT id,number,identifier,status_id FROM issues');
      expect(issue.rows).toEqual([
        {
          id: 'legacy-issue',
          number: 7,
          identifier: 'LEG-7',
          status_id: 'legacy-default',
        },
      ]);

      await expect(
        pool.query("UPDATE teams SET key='NEW' WHERE id='legacy-team'"),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm05_team_identity',
      });
      await expect(
        pool.query(
          "UPDATE teams SET next_issue_number=7 WHERE id='legacy-team'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm05_team_counter',
      });
      await expect(
        pool.query(
          "UPDATE issue_statuses SET is_default=false WHERE id='legacy-default'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm05_team_default',
      });
      await expect(
        pool.query("DELETE FROM team_memberships WHERE role='ADMIN'"),
      ).rejects.toMatchObject({ code: '23514', constraint: 'm05_team_admin' });
      await expect(
        pool.query("DELETE FROM teams WHERE id='legacy-team'"),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm05_team_identity',
      });
      // Every failed statement rolls back, preserving the upgraded team's usability.
      const retained = await pool.query<{ next_issue_number: number }>(
        "SELECT next_issue_number FROM teams WHERE id='legacy-team'",
      );
      expect(retained.rows[0]?.next_issue_number).toBe(8);
    });
  });

  it('rejects reused historical keys without rewriting or partially upgrading legacy records', async () => {
    await withLegacyDatabase(async (pool, source) => {
      await pool.query(`
        INSERT INTO teams(id,workspace_id,name,key,retired_at) VALUES
          ('old-team','legacy-workspace','Retired','DUP',now()),
          ('new-team','legacy-workspace','Replacement','DUP',NULL);
      `);
      await expect(
        migrate(drizzle(pool), { migrationsFolder: source }),
      ).rejects.toMatchObject({ cause: { code: '23505' } });
      const teams = await pool.query<{ id: string; key: string }>(
        'SELECT id,key FROM teams ORDER BY id',
      );
      expect(teams.rows).toEqual([
        { id: 'new-team', key: 'DUP' },
        { id: 'old-team', key: 'DUP' },
      ]);
      const visibility = await pool.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name='teams' AND column_name='visibility'",
      );
      expect(visibility.rows).toHaveLength(0);
    });
  });
});
