import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { integrationEnvironment } from './helpers/integration-environment';

async function withLegacyProjects(
  run: (pool: Pool, source: string) => Promise<void>,
) {
  const admin = new Pool({ connectionString: integrationEnvironment() });
  const name = `tream_test_project_upgrade_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(integrationEnvironment());
  url.pathname = `/${name}`;
  const folder = await mkdtemp(join(tmpdir(), 'tream-project-migration-'));
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    pool = new Pool({ connectionString: url.toString() });
    const source = resolve(__dirname, '../src/database/migrations');
    const journal = JSON.parse(
      await readFile(join(source, 'meta/_journal.json'), 'utf8'),
    ) as { entries: Array<{ idx: number; tag: string }> };
    journal.entries = journal.entries.filter((entry) => entry.idx <= 12);
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
        ('legacy-team','legacy-workspace','Retained team','LEG',2);
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

async function seedLinkedProject(pool: Pool) {
  await pool.query(`
    INSERT INTO projects(id,workspace_id,name,status,priority,lead_id,start_date,target_date,created_at,updated_at)
    VALUES ('legacy-project','legacy-workspace','Retained project','STARTED','HIGH',
      'legacy-owner-member','2025-02-01T14:30:00Z','2025-03-01T18:15:00Z',
      '2025-01-01T10:00:00Z','2025-01-15T11:00:00Z');
    INSERT INTO project_teams(id,project_id,team_id,created_at) VALUES
      ('legacy-project-team','legacy-project','legacy-team','2025-01-02T10:00:00Z');
    INSERT INTO issues(id,workspace_id,team_id,number,identifier,title,status_id,project_id)
    VALUES ('legacy-issue','legacy-workspace','legacy-team',1,'LEG-1',
      'Retained project issue','legacy-default','legacy-project');
    INSERT INTO audit_logs(id,workspace_id,actor_id,action,target_type,target_id,metadata,created_at)
    VALUES ('legacy-project-audit','legacy-workspace','legacy-owner-member',
      'project.updated','project','legacy-project','{"source":"legacy"}','2025-01-15T11:00:00Z');
  `);
}

describe('retained projects and workflow migration upgrade', () => {
  it('preserves legacy work, attribution gaps and facts while backfilling scoped catalogs', async () => {
    await withLegacyProjects(async (pool, source) => {
      await seedLinkedProject(pool);
      const before = await pool.query<Record<string, unknown>>(
        'SELECT * FROM projects ORDER BY id',
      );
      const facts = await pool.query<Record<string, unknown>>(
        'SELECT * FROM audit_logs ORDER BY id',
      );
      const members = await pool.query<Record<string, unknown>>(
        'SELECT * FROM team_memberships ORDER BY id',
      );
      await migrate(drizzle(pool), { migrationsFolder: source });

      const retained = await pool.query<Record<string, unknown>>(
        'SELECT * FROM projects ORDER BY id',
      );
      expect(before.rows).toHaveLength(1);
      expect(retained.rows[0]).toMatchObject(before.rows[0]!);
      expect(retained.rows[0]).toMatchObject({
        created_by_id: null,
        archived_at: null,
        completed_at: null,
      });
      const status = await pool.query<{
        category: string;
        status: string;
        is_default: boolean;
      }>(`SELECT s.category,p.status,s.is_default FROM projects p
          JOIN project_statuses s ON s.id=p.status_id AND s.workspace_id=p.workspace_id
          WHERE p.id='legacy-project'`);
      expect(status.rows).toEqual([
        { category: 'STARTED', status: 'STARTED', is_default: false },
      ]);
      const catalog = await pool.query<{
        category: string;
        is_default: boolean;
      }>(
        "SELECT category,is_default FROM project_statuses WHERE workspace_id='legacy-workspace' ORDER BY position",
      );
      expect(catalog.rows).toEqual([
        { category: 'PLANNED', is_default: true },
        { category: 'STARTED', is_default: false },
        { category: 'PAUSED', is_default: false },
        { category: 'COMPLETED', is_default: false },
        { category: 'CANCELED', is_default: false },
      ]);
      const links = await pool.query<Record<string, unknown>>(
        'SELECT * FROM project_teams ORDER BY id',
      );
      expect(links.rows).toEqual([
        {
          id: 'legacy-project-team',
          workspace_id: 'legacy-workspace',
          project_id: 'legacy-project',
          team_id: 'legacy-team',
          created_at: new Date('2025-01-02T10:00:00Z'),
        },
      ]);
      const issue = await pool.query<Record<string, unknown>>(
        'SELECT id,number,identifier,status_id,project_id,milestone_id FROM issues',
      );
      expect(issue.rows).toEqual([
        {
          id: 'legacy-issue',
          number: 1,
          identifier: 'LEG-1',
          status_id: 'legacy-default',
          project_id: 'legacy-project',
          milestone_id: null,
        },
      ]);
      expect(
        (await pool.query('SELECT * FROM audit_logs ORDER BY id')).rows,
      ).toEqual(facts.rows);
      expect(
        (await pool.query('SELECT * FROM team_memberships ORDER BY id')).rows,
      ).toEqual(members.rows);
      expect((await pool.query('SELECT * FROM events')).rows).toHaveLength(0);
    });
  });

  it('rejects an orphan legacy project without fabricating access or partially migrating', async () => {
    await withLegacyProjects(async (pool, source) => {
      await pool.query(`INSERT INTO projects(id,workspace_id,name,status)
        VALUES ('orphan-project','legacy-workspace','Orphan project','PAUSED')`);
      const original = await pool.query<Record<string, unknown>>(
        'SELECT * FROM projects',
      );
      await expect(
        migrate(drizzle(pool), { migrationsFolder: source }),
      ).rejects.toMatchObject({
        cause: { code: '23514', constraint: 'm06_legacy_project_team' },
      });
      expect((await pool.query('SELECT * FROM projects')).rows).toEqual(
        original.rows,
      );
      expect(
        (await pool.query('SELECT * FROM project_teams')).rows,
      ).toHaveLength(0);
      expect(
        (
          await pool.query(
            "SELECT column_name FROM information_schema.columns WHERE table_name='projects' AND column_name='status_id'",
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await pool.query(
            "SELECT to_regclass('public.project_statuses') AS name",
          )
        ).rows,
      ).toEqual([{ name: null }]);
    });
  });

  it('rejects closed legacy projects with unfinished work without rewriting project or issue history', async () => {
    for (const state of ['COMPLETED', 'CANCELED', 'DELETED']) {
      await withLegacyProjects(async (pool, source) => {
        await seedLinkedProject(pool);
        if (state === 'DELETED') {
          await pool.query(
            "UPDATE projects SET deleted_at='2025-01-16T10:00:00Z' WHERE id='legacy-project'",
          );
        } else {
          await pool.query(
            "UPDATE projects SET status=$1 WHERE id='legacy-project'",
            [state],
          );
        }
        const original = await pool.query<Record<string, unknown>>(
          'SELECT * FROM projects',
        );
        const issues = await pool.query<Record<string, unknown>>(
          'SELECT * FROM issues',
        );
        await expect(
          migrate(drizzle(pool), { migrationsFolder: source }),
        ).rejects.toMatchObject({
          cause: { code: '23514', constraint: 'm06_legacy_project_work' },
        });
        expect((await pool.query('SELECT * FROM projects')).rows).toEqual(
          original.rows,
        );
        expect((await pool.query('SELECT * FROM issues')).rows).toEqual(
          issues.rows,
        );
        expect(
          (
            await pool.query(
              "SELECT to_regclass('public.project_statuses') AS name",
            )
          ).rows,
        ).toEqual([{ name: null }]);
      });
    }
  });

  it('enforces default, team retention and same-project milestone constraints after upgrade', async () => {
    await withLegacyProjects(async (pool, source) => {
      await seedLinkedProject(pool);
      await migrate(drizzle(pool), { migrationsFolder: source });
      await expect(
        pool.query(
          'UPDATE project_statuses SET is_default=false WHERE is_default',
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm06_project_default',
      });
      await expect(
        pool.query(
          "DELETE FROM project_teams WHERE project_id='legacy-project'",
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'issues_project_team_tenant_fk',
      });
      await pool.query(`
        INSERT INTO projects(id,workspace_id,name,status_id)
        SELECT 'other-project','legacy-workspace','Other project',id
        FROM project_statuses WHERE workspace_id='legacy-workspace' AND is_default;
        INSERT INTO project_teams(id,workspace_id,project_id,team_id)
        VALUES ('other-link','legacy-workspace','other-project','legacy-team');
        INSERT INTO project_milestones(id,workspace_id,project_id,name,position)
        VALUES ('other-milestone','legacy-workspace','other-project','Other milestone',0);
      `);
      await expect(
        pool.query(
          "UPDATE issues SET milestone_id='other-milestone' WHERE id='legacy-issue'",
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'issues_milestone_project_fk',
      });
      await expect(
        pool.query(
          "DELETE FROM project_teams WHERE project_id='other-project'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm06_project_team_required',
      });
      await expect(
        pool.query(
          "UPDATE projects SET archived_at=now() WHERE id='legacy-project'",
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'm06_project_unfinished_issues',
      });
      const retained = await pool.query<{
        project_id: string;
        milestone_id: null;
      }>("SELECT project_id,milestone_id FROM issues WHERE id='legacy-issue'");
      expect(retained.rows).toEqual([
        { project_id: 'legacy-project', milestone_id: null },
      ]);
    });
  });
});
