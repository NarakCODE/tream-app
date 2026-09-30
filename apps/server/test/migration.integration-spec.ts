import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { integrationEnvironment } from './helpers/integration-environment';

describe('retained-schema migration upgrade', () => {
  it('preserves legacy sessions and facts while installing database guards', async () => {
    const base = integrationEnvironment();
    const admin = new Pool({ connectionString: base });
    const name = `tream_test_upgrade_${randomUUID().replaceAll('-', '')}`;
    const url = new URL(base);
    url.pathname = `/${name}`;
    const folder = await mkdtemp(join(tmpdir(), 'tream-migration-'));
    let pool: Pool | undefined;
    try {
      await admin.query(`CREATE DATABASE "${name}"`);
      pool = new Pool({ connectionString: url.toString() });
      const source = resolve(__dirname, '../src/database/migrations');
      const journal = JSON.parse(
        await readFile(join(source, 'meta/_journal.json'), 'utf8'),
      ) as { entries: Array<{ idx: number; tag: string }> };
      journal.entries = journal.entries.filter((entry) => entry.idx <= 6);
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
      await pool.query(
        "INSERT INTO users(id,email,full_name) VALUES('legacy-user','Legacy@Example.test','Legacy'); INSERT INTO refresh_sessions(id,user_id,token_hash,expires_at) VALUES('legacy-session','legacy-user','legacy-hash',now()+interval '1 day');",
      );
      await pool.query(
        "INSERT INTO workspaces(id,name,slug) VALUES('legacy-workspace','Legacy','Legacy-Workspace'); INSERT INTO memberships(id,workspace_id,user_id,role) VALUES('legacy-member','legacy-workspace','legacy-user','OWNER'); INSERT INTO events(id,workspace_id,event_type,payload) VALUES('legacy-event','legacy-workspace','workspace.created','{}'); INSERT INTO event_dispatch_attempts(id,event_id) VALUES('legacy-attempt-1','legacy-event'),('legacy-attempt-2','legacy-event');",
      );
      await migrate(drizzle(pool), { migrationsFolder: source });
      const facts = await pool.query<{ schema_version: number | null }>(
        "SELECT schema_version FROM events WHERE id='legacy-event'",
      );
      expect(facts.rows[0]?.schema_version).toBeNull();
      const attempts = await pool.query<{ status: string }>(
        "SELECT status FROM event_dispatch_attempts WHERE event_id='legacy-event'",
      );
      expect(attempts.rows).toHaveLength(2);
      expect(attempts.rows.every((row) => row.status === 'FAILED')).toBe(true);
      const sessions = await pool.query<{ family_id: string }>(
        "SELECT family_id FROM refresh_sessions WHERE id='legacy-session'",
      );
      expect(sessions.rows[0]?.family_id).toBe('legacy-session');
      const users = await pool.query<{
        email_verified_at: Date | null;
        email: string;
      }>("SELECT email_verified_at,email FROM users WHERE id='legacy-user'");
      expect(users.rows[0]?.email_verified_at).toBeNull();
      expect(users.rows[0]?.email).toBe('legacy@example.test');
      await expect(
        pool.query(
          "INSERT INTO workspaces(id,name,slug) VALUES('orphan','Orphan','orphan')",
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await pool.query(
        "INSERT INTO audit_logs(id,action,target_type,target_id) VALUES('immutable','test','user','legacy-user')",
      );
      await expect(
        pool.query(
          "UPDATE audit_logs SET action='tampered' WHERE id='immutable'",
        ),
      ).rejects.toMatchObject({ code: '23514' });
      // Production permissions are exercised with SET ROLE, not the owner login.
      await pool.query(
        await readFile(
          resolve(__dirname, '../scripts/provision-roles.sql'),
          'utf8',
        ),
      );
      const runtime = await pool.connect();
      try {
        await runtime.query('SET ROLE tream_runtime');
        await expect(
          runtime.query('TRUNCATE audit_logs'),
        ).rejects.toMatchObject({
          code: '42501',
        });
        await expect(
          runtime.query('ALTER TABLE users ADD COLUMN forbidden text'),
        ).rejects.toMatchObject({
          code: '42501',
        });
        await runtime.query('RESET ROLE');
      } finally {
        runtime.release();
      }
    } finally {
      await pool?.end();
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
      await rm(folder, { recursive: true, force: true });
    }
  });
});
