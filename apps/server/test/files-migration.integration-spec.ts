import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { integrationEnvironment } from './helpers/integration-environment';

async function withLegacyFiles(
  run: (pool: Pool, source: string) => Promise<void>,
) {
  const admin = new Pool({ connectionString: integrationEnvironment() });
  const name = `tream_test_files_upgrade_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(integrationEnvironment());
  url.pathname = `/${name}`;
  const folder = await mkdtemp(join(tmpdir(), 'tream-files-migration-'));
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    pool = new Pool({ connectionString: url.toString() });
    const source = resolve(__dirname, '../src/database/migrations');
    const journal = JSON.parse(
      await readFile(join(source, 'meta/_journal.json'), 'utf8'),
    ) as { entries: Array<{ idx: number; tag: string }> };
    journal.entries = journal.entries.filter((entry) => entry.idx <= 19);
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

describe('M10 private file migration and database invariants', () => {
  it('adds storage tables without rewriting retained issues, aliases, comments or facts', async () => {
    await withLegacyFiles(async (pool, source) => {
      await seedLegacyWork(pool);
      await pool.query(
        `INSERT INTO comments(id,workspace_id,issue_id,author_id,body) VALUES('legacy-comment','legacy-workspace','legacy-issue','legacy-owner-member','Retained comment');`,
      );
      const tables = [
        'issues',
        'issue_identifiers',
        'comments',
        'audit_logs',
        'cycles',
      ];
      const before = new Map<string, unknown[]>();
      for (const table of tables)
        before.set(
          table,
          (await pool.query(`SELECT * FROM ${table} ORDER BY id`)).rows,
        );
      await migrate(drizzle(pool), { migrationsFolder: source });
      for (const table of tables)
        expect(
          (await pool.query(`SELECT * FROM ${table} ORDER BY id`)).rows,
        ).toEqual(before.get(table));
      for (const table of ['files', 'attachments', 'storage_cleanup_jobs'])
        expect((await pool.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
    });
  });
  it('enforces immutable intents, exact attachment targets, verified metadata and cleanup boundaries', async () => {
    await withLegacyFiles(async (pool, source) => {
      await seedLegacyWork(pool);
      await migrate(drizzle(pool), { migrationsFolder: source });
      const checksum = 'a'.repeat(64);
      const insert =
        "INSERT INTO files(id,workspace_id,created_by_id,storage_key,name,declared_mime_type,size_bytes,sha256,source_attachment_id,upload_expires_at) VALUES($1,'legacy-workspace','legacy-owner-member',$2,$3,'text/plain',4,$4,$1 || '-attachment',now()+interval '1 hour')";
      await expect(
        pool.query(insert, ['bad-path', 'bad-path', '../bad.txt', checksum]),
      ).rejects.toMatchObject({ code: '23514', constraint: 'm10_file_name' });
      await pool.query(
        `WITH inserted AS (${insert} RETURNING id) INSERT INTO attachments(id,workspace_id,file_id,issue_id,created_by_id) SELECT 'retained-file-attachment','legacy-workspace',id,'legacy-issue','legacy-owner-member' FROM inserted`,
        ['retained-file', 'opaque-key', 'safe.txt', checksum],
      );
      await expect(
        pool.query(
          "UPDATE files SET storage_key='different-key' WHERE id='retained-file'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm10_file_identity',
      });
      await expect(
        pool.query(
          "UPDATE files SET source_attachment_id='different-origin' WHERE id='retained-file'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm10_file_identity',
      });
      await expect(
        pool.query(insert, [
          'missing-origin',
          'another-opaque-key',
          'safe.txt',
          checksum,
        ]),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'm10_file_origin_tenant_fk',
      });
      await expect(
        pool.query("DELETE FROM files WHERE id='retained-file'"),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm10_file_retention',
      });
      await expect(
        pool.query(
          "UPDATE files SET status='READY',uploaded_at=now(),ready_at=now(),actual_size_bytes=4,actual_sha256=sha256,actual_mime_type=declared_mime_type WHERE id='retained-file'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm10_file_transition',
      });
      await pool.query(
        "UPDATE files SET status='UPLOADED',uploaded_at=now() WHERE id='retained-file'",
      );
      await expect(
        pool.query(
          "UPDATE files SET status='READY',ready_at=now(),actual_size_bytes=3,actual_sha256=sha256,actual_mime_type=declared_mime_type WHERE id='retained-file'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm10_file_ready_metadata',
      });
      await pool.query(
        "UPDATE files SET status='READY',ready_at=now(),actual_size_bytes=4,actual_sha256=sha256,actual_mime_type=declared_mime_type WHERE id='retained-file'",
      );
      await expect(
        pool.query(
          "UPDATE files SET actual_size_bytes=3 WHERE id='retained-file'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm10_file_verified_identity',
      });
      await expect(
        pool.query(
          "INSERT INTO attachments(id,workspace_id,file_id,created_by_id) VALUES('no-target','legacy-workspace','retained-file','legacy-owner-member')",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm10_attachment_target',
      });
      await expect(
        pool.query(
          "UPDATE attachments SET issue_id=NULL WHERE id='retained-file-attachment'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm10_attachment_identity',
      });
      await expect(
        pool.query(
          "DELETE FROM attachments WHERE id='retained-file-attachment'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm10_attachment_retention',
      });
      await expect(
        pool.query(
          "INSERT INTO storage_cleanup_jobs(id,workspace_id,file_id,storage_key,reason,run_after) VALUES('bad-key','legacy-workspace','retained-file','other-key','DELETED',now())",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm10_cleanup_storage_key',
      });
      await expect(
        pool.query(
          "INSERT INTO storage_cleanup_jobs(id,workspace_id,file_id,storage_key,reason,run_after) VALUES('ready-job','legacy-workspace','retained-file','opaque-key','DELETED',now())",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm10_file_cleanup_ready',
      });
      await pool.query(
        "UPDATE files SET status='DELETED',deleted_at=now(),purge_after=now() WHERE id='retained-file'",
      );
      await pool.query(
        "INSERT INTO storage_cleanup_jobs(id,workspace_id,file_id,storage_key,reason,run_after) VALUES('cleanup-job','legacy-workspace','retained-file','opaque-key','DELETED',now())",
      );
      await expect(
        pool.query(
          "UPDATE files SET status='READY',deleted_at=NULL WHERE id='retained-file'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm10_file_cleanup_ready',
      });
      await pool.query(
        "UPDATE storage_cleanup_jobs SET status='PROCESSING',locked_by='worker',locked_until=now()+interval '1 minute' WHERE id='cleanup-job'",
      );
      await expect(
        pool.query(
          "UPDATE files SET status='READY',deleted_at=NULL WHERE id='retained-file'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm10_file_restore_claimed',
      });
      await expect(
        pool.query("DELETE FROM storage_cleanup_jobs WHERE id='cleanup-job'"),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm10_cleanup_retention',
      });
    });
  });
});
