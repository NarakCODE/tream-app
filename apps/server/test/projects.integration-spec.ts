import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { AppModule } from '../src/app.module';
import {
  configureApplication,
  createFastifyAdapter,
} from '../src/application.factory';
import { AUTH_MAIL_SENDER } from '../src/modules/iam/authentication/application/auth-mail';
import { EventWriter } from '../src/modules/eventing/application/event-writer.service';
import { prepareIntegrationDatabase } from './helpers/integration-environment';

type User = { accessToken: string; user: { id: string } };
type Entity = {
  id: string;
  name: string;
  category: string;
  isDefault: boolean;
  position: number;
  statusId: string;
  status: string;
  teamIds: string[];
  archivedAt: string | null;
  deletedAt: string | null;
  leadId: string | null;
  authorId: string;
  body: string;
  health: string;
};
type Fixture = {
  owner: User;
  workspaceId: string;
  path: string;
  statuses: string;
  teams: string;
};

describe('M06 projects PostgreSQL HTTP contracts', () => {
  let app: NestFastifyApplication;
  let database: Awaited<ReturnType<typeof prepareIntegrationDatabase>>;
  let events: EventWriter;
  let requestNumber = 0;

  beforeAll(async () => {
    database = await prepareIntegrationDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_MAIL_SENDER)
      .useValue({ send: () => Promise.resolve() })
      .compile();
    (await module.resolve(PinoLogger)).logger.level = 'silent';
    events = module.get(EventWriter);
    app = await configureApplication(
      module.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter(),
        { bufferLogs: true },
      ),
    );
    app.useLogger(false);
    PinoLogger.root.level = 'silent';
  });
  afterAll(async () => {
    await app?.close();
    await database?.cleanup();
  });
  function request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    user?: User,
    payload?: object,
    key = randomUUID(),
  ) {
    return app.inject({
      method,
      url: `/api/v1${path}`,
      headers: {
        ...(user ? { authorization: `Bearer ${user.accessToken}` } : {}),
        'idempotency-key': key,
      },
      remoteAddress: `10.60.${Math.floor(++requestNumber / 250)}.${(requestNumber % 250) + 1}`,
      ...(payload ? { payload } : {}),
    });
  }
  async function signup(): Promise<User> {
    const email = `projects-${randomUUID()}@example.test`;
    const response = await request('POST', '/auth/signup', undefined, {
      email,
      password: 'Integration-password-2026',
      fullName: 'Projects tester',
    });
    expect(response.statusCode).toBe(201);
    // Domain fixtures require a verified principal; token verification is covered
    // by the authentication contract suite.
    await database.connection.query(
      'UPDATE users SET email_verified_at = now() WHERE email = $1',
      [email],
    );
    const login = await request('POST', '/auth/login', undefined, {
      email,
      password: 'Integration-password-2026',
    });
    expect(login.statusCode).toBe(201);
    return login.json<{ data: User }>().data;
  }
  async function fixture(): Promise<Fixture> {
    const owner = await signup();
    const response = await request('POST', '/workspaces', owner, {
      name: 'Projects workspace',
      slug: `projects-${randomUUID()}`,
    });
    expect(response.statusCode).toBe(201);
    const workspaceId = response.json<{ data: Entity }>().data.id;
    const base = `/workspaces/${workspaceId}`;
    return {
      owner,
      workspaceId,
      path: `${base}/projects`,
      statuses: `${base}/project-statuses`,
      teams: `${base}/teams`,
    };
  }
  async function join(f: Fixture, role = 'MEMBER') {
    const user = await signup();
    const membershipId = randomUUID();
    await database.connection.query(
      'INSERT INTO memberships(id,workspace_id,user_id,role) VALUES ($1,$2,$3,$4)',
      [membershipId, f.workspaceId, user.user.id, role],
    );
    return { user, membershipId };
  }
  async function team(f: Fixture, user = f.owner, visibility = 'WORKSPACE') {
    const response = await request('POST', f.teams, user, {
      name: 'Project team',
      key: `P${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
      visibility,
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ data: Entity }>().data;
  }
  async function project(
    f: Fixture,
    teamIds: string[],
    extra = {},
    user = f.owner,
  ) {
    const response = await request('POST', f.path, user, {
      name: 'Project',
      teamIds,
      ...extra,
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ data: Entity }>().data;
  }
  async function statuses(f: Fixture) {
    const response = await request('GET', f.statuses, f.owner);
    expect(response.statusCode).toBe(200);
    return response.json<{ data: Entity[] }>().data;
  }
  async function addStatus(f: Fixture, name: string, category = 'PLANNED') {
    const response = await request('POST', f.statuses, f.owner, {
      name,
      category,
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ data: Entity }>().data;
  }
  async function issue(
    f: Fixture,
    teamId: string,
    projectId: string,
    terminal = false,
    milestoneId?: string,
  ) {
    const status = await database.connection.query<{ id: string }>(
      'SELECT id FROM issue_statuses WHERE team_id=$1 AND category=$2 AND retired_at IS NULL LIMIT 1',
      [teamId, terminal ? 'COMPLETED' : 'UNSTARTED'],
    );
    const allocation = (
      await database.connection.query<{ number: number; key: string }>(
        'UPDATE teams SET next_issue_number=next_issue_number+1 WHERE id=$1 RETURNING next_issue_number-1 AS number,key',
        [teamId],
      )
    ).rows[0]!;
    const id = randomUUID();
    await database.connection.query(
      'INSERT INTO issues(id,workspace_id,team_id,number,identifier,title,status_id,project_id,milestone_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        id,
        f.workspaceId,
        teamId,
        allocation.number,
        `${allocation.key}-${allocation.number}`,
        'Linked issue',
        status.rows[0]!.id,
        projectId,
        milestoneId ?? null,
      ],
    );
    return { id, statusId: status.rows[0]!.id };
  }

  it('requires authentication, creates a usable project atomically and replays without duplicate facts', async () => {
    const f = await fixture();
    expect((await request('GET', f.path)).statusCode).toBe(401);
    const t = await team(f);
    const key = randomUUID();
    const body = { name: 'Atomic project', teamIds: [t.id] };
    const responses = await Promise.all([
      request('POST', f.path, f.owner, body, key),
      request('POST', f.path, f.owner, body, key),
    ]);
    expect(responses.map((r) => r.statusCode)).toEqual([201, 201]);
    const p = responses[0].json<{ data: Entity }>().data;
    expect(responses[1].json<{ data: Entity }>().data).toEqual(p);
    expect(p.status).toBe('PLANNED');
    const detail = await request('GET', `${f.path}/${p.id}`, f.owner);
    expect(detail.statusCode).toBe(200);
    expect(detail.json<{ data: Entity }>().data.teamIds).toEqual([t.id]);
    expect(
      (
        await database.connection.query(
          'SELECT id FROM project_members WHERE project_id=$1',
          [p.id],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await database.connection.query(
          'SELECT event_type FROM events WHERE aggregate_id=$1',
          [p.id],
        )
      ).rows,
    ).toContainEqual({ event_type: 'project.created' });
    expect(
      (
        await database.connection.query(
          'SELECT id FROM audit_logs WHERE target_id=$1',
          [p.id],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await database.connection.query('SELECT id FROM projects WHERE id=$1', [
          p.id,
        ])
      ).rows,
    ).toHaveLength(1);
  });

  it('requires visibility of every associated team even for an owner, and scopes project totals/cursors', async () => {
    const f = await fixture();
    const admin = await join(f, 'ADMIN');
    const member = await join(f);
    const guest = await join(f, 'GUEST');
    const open = await team(f);
    const privateTeam = await team(f, admin.user, 'PRIVATE');
    const hidden = await project(f, [open.id, privateTeam.id], {}, admin.user);
    await project(f, [open.id]);
    await project(f, [open.id]);
    for (const user of [f.owner, member.user]) {
      for (const suffix of [
        '',
        '/teams',
        '/members',
        '/milestones',
        '/updates',
        '/progress',
      ])
        expect(
          (await request('GET', `${f.path}/${hidden.id}${suffix}`, user))
            .statusCode,
        ).toBe(404);
      const first = (await request('GET', `${f.path}?limit=1`, user)).json<{
        data: Entity[];
        meta: { total: number; nextCursor: string; hasNext: boolean };
      }>();
      expect(first.meta).toMatchObject({ total: 2, hasNext: true });
      const second = (
        await request(
          'GET',
          `${f.path}?limit=1&cursor=${encodeURIComponent(first.meta.nextCursor)}`,
          user,
        )
      ).json<{ data: Entity[]; meta: { total: number; hasNext: boolean } }>();
      expect(second.meta).toMatchObject({ total: 2, hasNext: false });
      expect(second.data[0]!.id).not.toBe(first.data[0]!.id);
    }
    expect((await request('GET', f.path, guest.user)).statusCode).toBe(403);
    expect(
      (
        await request('POST', f.path, guest.user, {
          name: 'Guest project',
          teamIds: [open.id],
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request('POST', `${f.path}/${hidden.id}/updates`, guest.user, {
          body: 'Denied',
          health: 'ON_TRACK',
        })
      ).statusCode,
    ).toBe(403);
  });

  it('refreshes project membership authorization before replaying a cached command', async () => {
    const f = await fixture();
    const t = await team(f);
    const member = await join(f);
    const p = await project(f, [t.id]);
    const detail = `${f.path}/${p.id}`;
    expect(
      (await request('PATCH', detail, member.user, { name: 'Denied' }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await request('POST', `${detail}/members`, f.owner, {
          membershipId: member.membershipId,
        })
      ).statusCode,
    ).toBe(201);
    const key = randomUUID();
    const body = { name: 'Member edit' };
    expect(
      (await request('PATCH', detail, member.user, body, key)).statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          'DELETE',
          `${detail}/members/${member.membershipId}`,
          f.owner,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await request('PATCH', detail, member.user, body, key)).statusCode,
    ).toBe(403);
    expect(
      (
        await database.connection.query(
          "SELECT id FROM events WHERE aggregate_id=$1 AND event_type='project.updated'",
          [p.id],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it('lets a workspace member create and manage their project while retaining private-team requirements', async () => {
    const f = await fixture();
    const member = await join(f);
    const open = await team(f);
    const privateTeam = await team(f, f.owner, 'PRIVATE');
    expect(
      (
        await request('POST', f.path, member.user, {
          name: 'Hidden team',
          teamIds: [privateTeam.id],
        })
      ).statusCode,
    ).toBe(404);
    const p = await project(f, [open.id], {}, member.user);
    expect(
      (
        await request('PATCH', `${f.path}/${p.id}`, member.user, {
          summary: 'Managed by its creator',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await database.connection.query<{ membership_id: string }>(
          'SELECT membership_id FROM project_members WHERE project_id=$1',
          [p.id],
        )
      ).rows,
    ).toEqual([{ membership_id: member.membershipId }]);
    expect(
      (
        await request('POST', `${f.path}/${p.id}/teams`, member.user, {
          teamId: privateTeam.id,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('rejects cross-workspace associations, empty team sets, invalid calendars and date ranges', async () => {
    const f = await fixture();
    const other = await fixture();
    const t = await team(f);
    const foreignTeam = await team(other);
    const foreignMember = await join(other);
    for (const extra of [
      { teamIds: [] },
      { startDate: '2026-02-30' },
      { startDate: '2026-12-01', targetDate: '2026-11-01' },
    ])
      expect(
        (
          await request('POST', f.path, f.owner, {
            name: 'Invalid project',
            teamIds: [t.id],
            ...extra,
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (
        await request('POST', f.path, f.owner, {
          name: 'Cross tenant',
          teamIds: [foreignTeam.id],
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request('POST', f.path, f.owner, {
          name: 'Foreign lead',
          teamIds: [t.id],
          leadId: foreignMember.membershipId,
        })
      ).statusCode,
    ).toBe(404);
    const p = await project(f, [t.id], {
      startDate: '2028-02-29',
      targetDate: '2028-03-01',
      priority: 'HIGH',
    });
    expect(
      (
        await request('PATCH', `${f.path}/${p.id}`, f.owner, {
          targetDate: '2028-02-28',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request('POST', `${f.path}/${p.id}/teams`, f.owner, {
          teamId: foreignTeam.id,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await request('GET', `${other.path}/${p.id}`, other.owner)).statusCode,
    ).toBe(404);
  });

  it('serializes concurrent last-team removals and protects issue team associations', async () => {
    const f = await fixture();
    const first = await team(f);
    const second = await team(f);
    const p = await project(f, [first.id, second.id]);
    const detail = `${f.path}/${p.id}`;
    const results = await Promise.all([
      request('DELETE', `${detail}/teams/${first.id}`, f.owner),
      request('DELETE', `${detail}/teams/${second.id}`, f.owner),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const associations = (
      await database.connection.query<{ team_id: string }>(
        'SELECT team_id FROM project_teams WHERE project_id=$1',
        [p.id],
      )
    ).rows;
    expect(associations).toHaveLength(1);
    const remaining = associations[0]!.team_id;
    const extra = await team(f);
    expect(
      (await request('POST', `${detail}/teams`, f.owner, { teamId: extra.id }))
        .statusCode,
    ).toBe(201);
    await issue(f, remaining, p.id, true);
    expect(
      (await request('DELETE', `${detail}/teams/${remaining}`, f.owner))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await database.connection.query(
          'SELECT id FROM project_teams WHERE project_id=$1 AND team_id=$2',
          [p.id, remaining],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it('serializes defaults, requires explicit usable replacement and preserves in-use status categories', async () => {
    const f = await fixture();
    const t = await team(f);
    const p = await project(f, [t.id]);
    const first = await addStatus(f, 'Queued');
    const second = await addStatus(f, 'Ready');
    const defaults = await Promise.all([
      request('POST', `${f.statuses}/${first.id}/default`, f.owner),
      request('POST', `${f.statuses}/${second.id}/default`, f.owner),
    ]);
    expect(defaults.map((r) => r.statusCode)).toEqual([201, 201]);
    const active = await statuses(f);
    expect(active.filter((s) => s.isDefault)).toHaveLength(1);
    const currentDefault = active.find((s) => s.isDefault)!;
    expect(
      (await request('DELETE', `${f.statuses}/${currentDefault.id}`, f.owner))
        .statusCode,
    ).toBe(409);
    expect(
      (await request('DELETE', `${f.statuses}/${p.statusId}`, f.owner))
        .statusCode,
    ).toBe(409);
    const completed = active.find((s) => s.category === 'COMPLETED')!;
    expect(
      (
        await request('DELETE', `${f.statuses}/${p.statusId}`, f.owner, {
          replacementStatusId: completed.id,
        })
      ).statusCode,
    ).toBe(409);
    const replacement = currentDefault.id === first.id ? second : first;
    expect(
      (
        await request('DELETE', `${f.statuses}/${p.statusId}`, f.owner, {
          replacementStatusId: replacement.id,
        })
      ).statusCode,
    ).toBe(200);
    const persisted = (
      await database.connection.query<{ status_id: string; status: string }>(
        'SELECT status_id,status FROM projects WHERE id=$1',
        [p.id],
      )
    ).rows[0]!;
    expect(persisted).toMatchObject({
      status_id: replacement.id,
      status: 'PLANNED',
    });
    expect(
      (
        await request('PATCH', `${f.statuses}/${replacement.id}`, f.owner, {
          category: 'COMPLETED',
        })
      ).statusCode,
    ).toBe(409);
  });

  it('reorders the full status catalog atomically and denies nonadministrator catalog writes', async () => {
    const f = await fixture();
    const member = await join(f);
    const all = await statuses(f);
    const ids = all.map((s) => s.id).reverse();
    expect(
      (
        await request('POST', `${f.statuses}/reorder`, member.user, {
          statusIds: ids,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request('POST', `${f.statuses}/reorder`, f.owner, {
          statusIds: ids.slice(1),
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request('POST', `${f.statuses}/reorder`, f.owner, {
          statusIds: ids,
        })
      ).statusCode,
    ).toBe(201);
    expect((await statuses(f)).map((s) => s.id)).toEqual(ids);
    expect(
      (
        await request('POST', f.statuses, f.owner, {
          name: ` ${all[0]!.name.toUpperCase()} `,
          category: all[0]!.category,
        })
      ).statusCode,
    ).toBe(409);
  });

  it('does not rewrite hidden private projects through workspace status replacement', async () => {
    const f = await fixture();
    const admin = await join(f, 'ADMIN');
    const hiddenTeam = await team(f, admin.user, 'PRIVATE');
    const hidden = await project(f, [hiddenTeam.id], {}, admin.user);
    const replacement = await addStatus(f, 'Replacement planned');
    const before = await statuses(f);
    expect(
      (
        await request('DELETE', `${f.statuses}/${hidden.statusId}`, f.owner, {
          replacementStatusId: replacement.id,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await database.connection.query<{ status_id: string }>(
          'SELECT status_id FROM projects WHERE id=$1',
          [hidden.id],
        )
      ).rows[0]!.status_id,
    ).toBe(hidden.statusId);
    expect(await statuses(f)).toEqual(before);
    const ownerMembership = (
      await database.connection.query<{ id: string }>(
        'SELECT id FROM memberships WHERE workspace_id=$1 AND user_id=$2',
        [f.workspaceId, f.owner.user.id],
      )
    ).rows[0]!.id;
    expect(
      (
        await request(
          'POST',
          `${f.teams}/${hiddenTeam.id}/members`,
          admin.user,
          { membershipId: ownerMembership },
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await request('DELETE', `${f.statuses}/${hidden.statusId}`, f.owner, {
          replacementStatusId: replacement.id,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await database.connection.query<{ status_id: string }>(
          'SELECT status_id FROM projects WHERE id=$1',
          [hidden.id],
        )
      ).rows[0]!.status_id,
    ).toBe(replacement.id);
  });

  it('blocks terminal, archive and delete transitions with unfinished issues without rewriting them', async () => {
    const f = await fixture();
    const t = await team(f);
    const p = await project(f, [t.id]);
    const linked = await issue(f, t.id, p.id);
    const detail = `${f.path}/${p.id}`;
    const catalog = await statuses(f);
    for (const category of ['COMPLETED', 'CANCELED'])
      expect(
        (
          await request('PATCH', detail, f.owner, {
            statusId: catalog.find((s) => s.category === category)!.id,
          })
        ).statusCode,
      ).toBe(409);
    expect(
      (await request('POST', `${detail}/archive`, f.owner)).statusCode,
    ).toBe(409);
    expect((await request('DELETE', detail, f.owner)).statusCode).toBe(409);
    expect(
      (
        await database.connection.query<{ status_id: string }>(
          'SELECT status_id FROM issues WHERE id=$1',
          [linked.id],
        )
      ).rows[0]!.status_id,
    ).toBe(linked.statusId);
    const completed = (
      await database.connection.query<{ id: string }>(
        "SELECT id FROM issue_statuses WHERE team_id=$1 AND category='COMPLETED'",
        [t.id],
      )
    ).rows[0]!.id;
    await database.connection.query(
      'UPDATE issues SET status_id=$1 WHERE id=$2',
      [completed, linked.id],
    );
    expect(
      (
        await request('PATCH', detail, f.owner, {
          statusId: catalog.find((s) => s.category === 'COMPLETED')!.id,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request('POST', `${detail}/archive`, f.owner)).statusCode,
    ).toBe(201);
    expect(
      (await request('PATCH', detail, f.owner, { name: 'Archived mutation' }))
        .statusCode,
    ).toBe(409);
    expect(
      (await request('POST', `${detail}/restore`, f.owner)).statusCode,
    ).toBe(201);
    expect((await request('DELETE', detail, f.owner)).statusCode).toBe(200);
    expect((await request('GET', detail, f.owner)).statusCode).toBe(404);
    expect(
      (await request('POST', `${detail}/restore`, f.owner)).statusCode,
    ).toBe(201);
  });

  it('requires usable dependencies on restore and retains archived history', async () => {
    const f = await fixture();
    const t = await team(f);
    const member = await join(f);
    const p = await project(f, [t.id], { leadId: member.membershipId });
    const detail = `${f.path}/${p.id}`;
    expect(
      (await request('POST', `${detail}/archive`, f.owner)).statusCode,
    ).toBe(201);
    await database.connection.query(
      "UPDATE memberships SET state='SUSPENDED' WHERE id=$1",
      [member.membershipId],
    );
    expect(
      (await request('POST', `${detail}/restore`, f.owner)).statusCode,
    ).toBe(409);
    expect(
      (
        await database.connection.query<{ archived_at: Date | null }>(
          'SELECT archived_at FROM projects WHERE id=$1',
          [p.id],
        )
      ).rows[0]!.archived_at,
    ).not.toBeNull();
    const disposableTeam = await team(f);
    const disposable = await project(f, [disposableTeam.id]);
    expect(
      (await request('DELETE', `${f.path}/${disposable.id}`, f.owner))
        .statusCode,
    ).toBe(200);
    expect(
      (await request('DELETE', `${f.teams}/${disposableTeam.id}`, f.owner))
        .statusCode,
    ).toBe(200);
    expect(
      (await request('POST', `${f.path}/${disposable.id}/restore`, f.owner))
        .statusCode,
    ).toBe(409);
  });

  it('validates scoped leads and project members, and reserves management to authorized members', async () => {
    const f = await fixture();
    const foreign = await fixture();
    const t = await team(f);
    const p = await project(f, [t.id]);
    const member = await join(f);
    const suspended = await join(f);
    const guest = await join(f, 'GUEST');
    const outsider = await join(foreign);
    await database.connection.query(
      "UPDATE memberships SET state='SUSPENDED' WHERE id=$1",
      [suspended.membershipId],
    );
    const detail = `${f.path}/${p.id}`;
    for (const invalid of [suspended, guest]) {
      expect(
        (
          await request('POST', `${detail}/members`, f.owner, {
            membershipId: invalid.membershipId,
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await request('PATCH', detail, f.owner, {
            leadId: invalid.membershipId,
          })
        ).statusCode,
      ).toBe(409);
    }
    expect(
      (
        await request('POST', `${detail}/members`, f.owner, {
          membershipId: outsider.membershipId,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request('POST', `${detail}/members`, f.owner, {
          membershipId: member.membershipId,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (await request('PATCH', detail, f.owner, { leadId: member.membershipId }))
        .statusCode,
    ).toBe(200);
    expect(
      (await request('PATCH', detail, member.user, { priority: 'URGENT' }))
        .statusCode,
    ).toBe(200);
  });

  it('orders milestones atomically and rejects wrong-project milestones at the database boundary', async () => {
    const f = await fixture();
    const t = await team(f);
    const p = await project(f, [t.id]);
    const other = await project(f, [t.id]);
    const detail = `${f.path}/${p.id}`;
    const milestones: Entity[] = [];
    for (const name of ['First', 'Second']) {
      const response = await request('POST', `${detail}/milestones`, f.owner, {
        name,
        targetDate: '2026-11-30',
      });
      expect(response.statusCode).toBe(201);
      milestones.push(response.json<{ data: Entity }>().data);
    }
    const ids = milestones.map((m) => m.id).reverse();
    expect(
      (
        await request('POST', `${detail}/milestones/reorder`, f.owner, {
          milestoneIds: ids,
        })
      ).statusCode,
    ).toBe(201);
    const ordered = (
      await request('GET', `${detail}/milestones`, f.owner)
    ).json<{ data: Entity[] }>().data;
    expect(ordered.map((m) => m.id)).toEqual(ids);
    expect(ordered.map((m) => m.position)).toEqual([0, 1]);
    expect(
      (
        await request('POST', `${detail}/milestones/reorder`, f.owner, {
          milestoneIds: ids.slice(1),
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request(
          'PATCH',
          `${f.path}/${other.id}/milestones/${ids[0]}`,
          f.owner,
          { name: 'Wrong parent' },
        )
      ).statusCode,
    ).toBe(404);
    await expect(issue(f, t.id, other.id, false, ids[0])).rejects.toMatchObject(
      { code: '23503' },
    );
    const linked = await issue(f, t.id, p.id, false, ids[0]);
    expect(
      (await request('DELETE', `${detail}/milestones/${ids[0]}`, f.owner))
        .statusCode,
    ).toBe(409);
    await database.connection.query(
      'UPDATE issues SET milestone_id=NULL WHERE id=$1',
      [linked.id],
    );
    expect(
      (await request('DELETE', `${detail}/milestones/${ids[0]}`, f.owner))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await request('PATCH', `${detail}/milestones/${ids[1]}`, f.owner, {
          name: 'Renamed',
        })
      ).statusCode,
    ).toBe(200);
  });

  it('derives issue progress and scopes update authors/history to the project workspace', async () => {
    const f = await fixture();
    const t = await team(f);
    const p = await project(f, [t.id]);
    const detail = `${f.path}/${p.id}`;
    await issue(f, t.id, p.id);
    await issue(f, t.id, p.id, true);
    const progress = await request('GET', `${detail}/progress`, f.owner);
    expect(progress.statusCode).toBe(200);
    expect(
      progress.json<{ data: { total: number; completed: number } }>().data,
    ).toMatchObject({ total: 2, completed: 1 });
    const response = await request('POST', `${detail}/updates`, f.owner, {
      body: 'Scope is on track.',
      health: 'ON_TRACK',
    });
    expect(response.statusCode).toBe(201);
    const update = response.json<{ data: Entity }>().data;
    const membership = (
      await database.connection.query<{ id: string }>(
        'SELECT id FROM memberships WHERE workspace_id=$1 AND user_id=$2',
        [f.workspaceId, f.owner.user.id],
      )
    ).rows[0]!.id;
    expect(update).toMatchObject({
      authorId: membership,
      body: 'Scope is on track.',
      health: 'ON_TRACK',
    });
    const history = (await request('GET', `${detail}/updates`, f.owner)).json<{
      data: Entity[];
    }>().data;
    expect(history).toHaveLength(1);
    expect(history[0]!.id).toBe(update.id);
    expect(
      (
        await request('POST', `${detail}/updates`, f.owner, {
          body: 'Forged',
          health: 'AT_RISK',
          authorId: randomUUID(),
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request('POST', `${detail}/updates`, f.owner, {
          body: 'Forged',
          health: 'AT_RISK',
          progress: 100,
        })
      ).statusCode,
    ).toBe(400);
  });

  it('rolls back the project, membership, team link, events and audit if event persistence fails', async () => {
    const f = await fixture();
    const t = await team(f);
    await statuses(f);
    const name = `Rollback-${randomUUID()}`;
    const key = randomUUID();
    const spy = jest
      .spyOn(events, 'append')
      .mockRejectedValueOnce(new Error('Simulated event failure'));
    try {
      expect(
        (await request('POST', f.path, f.owner, { name, teamIds: [t.id] }, key))
          .statusCode,
      ).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect(
      (
        await database.connection.query(
          'SELECT id FROM projects WHERE workspace_id=$1 AND name=$2',
          [f.workspaceId, name],
        )
      ).rows,
    ).toEqual([]);
    const retry = await request(
      'POST',
      f.path,
      f.owner,
      { name, teamIds: [t.id] },
      key,
    );
    expect(retry.statusCode).toBe(201);
    const p = retry.json<{ data: Entity }>().data;
    expect(
      (
        await database.connection.query(
          'SELECT id FROM events WHERE aggregate_id=$1',
          [p.id],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await database.connection.query(
          'SELECT id FROM audit_logs WHERE target_id=$1',
          [p.id],
        )
      ).rows,
    ).toHaveLength(1);
  });
});
