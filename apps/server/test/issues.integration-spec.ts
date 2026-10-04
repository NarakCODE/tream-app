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
  revision: number;
  identifier: string;
  number: number;
  teamId: string;
  statusId: string;
  projectId: string | null;
  milestoneId: string | null;
  cycleId: string | null;
  parentId: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  title: string;
  isDefault: boolean;
  category: string;
};
type Fixture = {
  owner: User;
  workspaceId: string;
  base: string;
  path: string;
  team: Entity;
};

describe('M07 issues PostgreSQL HTTP contracts', () => {
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
      remoteAddress: `10.71.${Math.floor(++requestNumber / 250)}.${(requestNumber % 250) + 1}`,
      ...(payload ? { payload } : {}),
    });
  }
  async function signup(): Promise<User> {
    const email = `issues-${randomUUID()}@example.test`;
    const r = await request('POST', '/auth/signup', undefined, {
      email,
      password: 'Integration-password-2026',
      fullName: 'Issues tester',
    });
    expect(r.statusCode).toBe(201);
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
  async function team(
    f: Pick<Fixture, 'base' | 'owner'>,
    visibility = 'WORKSPACE',
  ) {
    const r = await request('POST', `${f.base}/teams`, f.owner, {
      name: 'Issue team',
      key: `I${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
      visibility,
    });
    expect(r.statusCode).toBe(201);
    return r.json<{ data: Entity }>().data;
  }
  async function fixture(): Promise<Fixture> {
    const owner = await signup();
    const r = await request('POST', '/workspaces', owner, {
      name: 'Issue workspace',
      slug: `issues-${randomUUID()}`,
    });
    expect(r.statusCode).toBe(201);
    const workspaceId = r.json<{ data: Entity }>().data.id;
    const base = `/workspaces/${workspaceId}`;
    const t = await team({ owner, base });
    return { owner, workspaceId, base, path: `${base}/issues`, team: t };
  }
  async function join(f: Fixture, role = 'MEMBER') {
    const user = await signup();
    const membershipId = randomUUID();
    await database.connection.query(
      'INSERT INTO memberships(id,workspace_id,user_id,role) VALUES($1,$2,$3,$4)',
      [membershipId, f.workspaceId, user.user.id, role],
    );
    return { user, membershipId };
  }
  async function create(f: Fixture, extra: object = {}, key = randomUUID()) {
    const r = await request(
      'POST',
      f.path,
      f.owner,
      { teamId: f.team.id, title: 'Issue', ...extra },
      key,
    );
    expect(r.statusCode).toBe(201);
    return r.json<{ data: Entity }>().data;
  }
  async function statuses(f: Fixture, teamId = f.team.id) {
    const r = await request(
      'GET',
      `${f.base}/teams/${teamId}/statuses`,
      f.owner,
    );
    expect(r.statusCode).toBe(200);
    return r.json<{ data: Entity[] }>().data;
  }

  it('creates issues atomically with monotonic identifiers, default status and stable idempotent facts', async () => {
    const f = await fixture();
    const key = randomUUID();
    const issue = await create(
      f,
      { title: 'First issue', priority: 'HIGH', estimate: 5 },
      key,
    );
    expect(issue.revision).toBe(1);
    expect(issue.number).toBe(1);
    expect(issue.statusId).toBe(
      (await statuses(f)).find((s) => s.isDefault)?.id,
    );
    const replay = await request(
      'POST',
      f.path,
      f.owner,
      {
        teamId: f.team.id,
        title: 'First issue',
        priority: 'HIGH',
        estimate: 5,
      },
      key,
    );
    expect(replay.statusCode).toBe(201);
    expect(replay.json<{ data: Entity }>().data).toEqual(issue);
    const facts = await database.connection.query<{ count: string }>(
      'SELECT count(*) FROM events WHERE aggregate_id=$1 AND event_type=$2',
      [issue.id, 'issue.created'],
    );
    expect(Number(facts.rows[0]!.count)).toBe(1);
    const created = await Promise.all(
      Array.from({ length: 10 }, () => create(f)),
    );
    expect(created.map((i) => i.number).sort((a, b) => a - b)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(new Set(created.map((i) => i.identifier)).size).toBe(10);
  });

  it('enforces optimistic revisions while replaying an already committed mutation', async () => {
    const f = await fixture();
    const issue = await create(f);
    const key = randomUUID();
    const body = { expectedRevision: issue.revision, title: 'Changed' };
    const changed = await request(
      'PATCH',
      `${f.path}/${issue.id}`,
      f.owner,
      body,
      key,
    );
    expect(changed.statusCode).toBe(200);
    const next = changed.json<{ data: Entity }>().data;
    expect(next.revision).toBe(2);
    const replay = await request(
      'PATCH',
      `${f.path}/${issue.id}`,
      f.owner,
      body,
      key,
    );
    expect(replay.statusCode).toBe(200);
    expect(replay.json<{ data: Entity }>().data).toEqual(next);
    expect(
      (
        await request('PATCH', `${f.path}/${issue.id}`, f.owner, {
          expectedRevision: 1,
          title: 'Stale',
        })
      ).statusCode,
    ).toBe(409);
    const race = await Promise.all(
      ['A', 'B'].map((title) =>
        request('PATCH', `${f.path}/${issue.id}`, f.owner, {
          expectedRevision: 2,
          title,
        }),
      ),
    );
    expect(race.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(
      (
        await request('PATCH', `${f.path}/${issue.id}`, f.owner, {
          title: 'Missing revision',
        })
      ).statusCode,
    ).toBe(400);
  });

  it('filters visible issues and seeks tied timestamps without repeats', async () => {
    const f = await fixture();
    const second = await team(f);
    const a = await create(f, { priority: 'HIGH' });
    const b = await create(f, { priority: 'HIGH' });
    await create(f, { teamId: second.id, priority: 'LOW' });
    await database.connection.query(
      "UPDATE issues SET created_at='2026-01-01T00:00:00.123456Z' WHERE id=ANY($1::text[])",
      [[a.id, b.id]],
    );
    const first = await request(
      'GET',
      `${f.path}?teamId=${f.team.id}&priority=HIGH&limit=1`,
      f.owner,
    );
    expect(first.statusCode).toBe(200);
    const page = first.json<{
      data: Entity[];
      meta: { total: number; nextCursor: string };
    }>();
    expect(page.meta.total).toBe(2);
    const last = await request(
      'GET',
      `${f.path}?teamId=${f.team.id}&priority=HIGH&limit=1&cursor=${encodeURIComponent(page.meta.nextCursor)}`,
      f.owner,
    );
    expect(last.statusCode).toBe(200);
    expect(
      new Set(
        [...page.data, ...last.json<{ data: Entity[] }>().data].map(
          (i) => i.id,
        ),
      ).size,
    ).toBe(2);
  });

  it('hides private-team and all-team-private-project work; guest shares remain read only', async () => {
    const f = await fixture();
    const member = await join(f);
    const guest = await join(f, 'GUEST');
    const privateTeam = await team(f, 'PRIVATE');
    const hidden = await create(f, { teamId: privateTeam.id });
    expect(
      (await request('GET', `${f.path}/${hidden.id}`, member.user)).statusCode,
    ).toBe(404);
    const p = await request('POST', `${f.base}/projects`, f.owner, {
      name: 'Mixed private',
      teamIds: [f.team.id, privateTeam.id],
    });
    expect(p.statusCode).toBe(201);
    const mixed = await create(f, {
      projectId: p.json<{ data: Entity }>().data.id,
    });
    expect(
      (await request('GET', `${f.path}/${mixed.id}`, member.user)).statusCode,
    ).toBe(404);
    await database.connection.query(
      'INSERT INTO team_memberships(id,workspace_id,team_id,membership_id) VALUES($1,$2,$3,$4)',
      [randomUUID(), f.workspaceId, f.team.id, guest.membershipId],
    );
    const readable = await create(f);
    expect(
      (await request('GET', `${f.path}/${readable.id}`, guest.user)).statusCode,
    ).toBe(200);
    expect(
      (
        await request('PATCH', `${f.path}/${readable.id}`, guest.user, {
          expectedRevision: readable.revision,
          title: 'Forbidden',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request('POST', f.path, guest.user, {
          teamId: f.team.id,
          title: 'Forbidden',
        })
      ).statusCode,
    ).toBe(403);
    const visible = (await request('GET', f.path, member.user)).json<{
      data: Entity[];
    }>().data;
    expect(visible.map((i) => i.id)).not.toContain(hidden.id);
    expect(visible.map((i) => i.id)).not.toContain(mixed.id);
  });

  it('rolls back allocation, issue, identifiers and audit when event persistence fails', async () => {
    const f = await fixture();
    const spy = jest
      .spyOn(events, 'append')
      .mockRejectedValueOnce(new Error('Injected issue event failure'));
    try {
      expect(
        (
          await request('POST', f.path, f.owner, {
            teamId: f.team.id,
            title: 'Rollback',
          })
        ).statusCode,
      ).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect((await create(f)).number).toBe(1);
    const rows = await database.connection.query<{ count: string }>(
      'SELECT count(*) FROM issues WHERE team_id=$1',
      [f.team.id],
    );
    expect(Number(rows.rows[0]!.count)).toBe(1);
  });
  it('preserves every old identifier through opposing transfers and archived or trashed lookup', async () => {
    const f = await fixture();
    const destination = await team(f);
    const a = await create(f);
    const b = await create(f, { teamId: destination.id });
    const moved = await Promise.all([
      request('POST', `${f.path}/${a.id}/transfer`, f.owner, {
        expectedRevision: a.revision,
        teamId: destination.id,
      }),
      request('POST', `${f.path}/${b.id}/transfer`, f.owner, {
        expectedRevision: b.revision,
        teamId: f.team.id,
      }),
    ]);
    expect(moved.map((r) => r.statusCode)).toEqual([200, 200]);
    const next = moved[0].json<{ data: Entity }>().data;
    expect(next.number).toBe(2);
    expect(next.teamId).toBe(destination.id);
    expect(next.identifier).not.toBe(a.identifier);
    const alias = await request(
      'GET',
      `${f.path}/identifier/${a.identifier}`,
      f.owner,
    );
    expect(alias.statusCode).toBe(200);
    expect(alias.json<{ data: Entity }>().data.id).toBe(a.id);
    const archived = await request(
      'POST',
      `${f.path}/${a.id}/archive`,
      f.owner,
      { expectedRevision: next.revision },
    );
    expect(archived.statusCode).toBe(200);
    const ar = archived.json<{ data: Entity }>().data;
    expect(
      (await request('GET', `${f.path}/identifier/${a.identifier}`, f.owner))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await request('PATCH', `${f.path}/${a.id}`, f.owner, {
          expectedRevision: ar.revision,
          title: 'Inactive',
        })
      ).statusCode,
    ).toBe(409);
    const restore = await request(
      'POST',
      `${f.path}/${a.id}/restore`,
      f.owner,
      { expectedRevision: ar.revision },
    );
    expect(restore.statusCode).toBe(200);
    const current = restore.json<{ data: Entity }>().data;
    expect(
      (
        await request('DELETE', `${f.path}/${a.id}`, f.owner, {
          expectedRevision: current.revision,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request('GET', `${f.path}/identifier/${a.identifier}`, f.owner))
        .statusCode,
    ).toBe(200);
    const aliases = await database.connection.query<{
      identifier: string;
      is_current: boolean;
    }>(
      'SELECT identifier,is_current FROM issue_identifiers WHERE issue_id=$1',
      [a.id],
    );
    expect(aliases.rows).toHaveLength(2);
    expect(aliases.rows.filter((x) => x.is_current)).toHaveLength(1);
  });

  it('rejects cross-team statuses, unavailable assignees and wrong-project milestones without consuming identifiers', async () => {
    const f = await fixture();
    const otherTeam = await team(f);
    const otherStatus = (await statuses(f, otherTeam.id)).find(
      (s) => s.isDefault,
    )!;
    expect(
      (
        await request('POST', f.path, f.owner, {
          teamId: f.team.id,
          title: 'Wrong status',
          statusId: otherStatus.id,
        })
      ).statusCode,
    ).toBe(404);
    const guest = await join(f, 'GUEST');
    expect(
      (
        await request('POST', f.path, f.owner, {
          teamId: f.team.id,
          title: 'Guest assignee',
          assigneeId: guest.membershipId,
        })
      ).statusCode,
    ).toBe(409);
    const member = await join(f);
    await database.connection.query(
      "UPDATE memberships SET state='SUSPENDED' WHERE id=$1",
      [member.membershipId],
    );
    expect(
      (
        await request('POST', f.path, f.owner, {
          teamId: f.team.id,
          title: 'Inactive assignee',
          assigneeId: member.membershipId,
        })
      ).statusCode,
    ).toBe(409);
    const project = await request('POST', `${f.base}/projects`, f.owner, {
      name: 'Project',
      teamIds: [f.team.id],
    });
    expect(project.statusCode).toBe(201);
    const otherProject = await request('POST', `${f.base}/projects`, f.owner, {
      name: 'Other project',
      teamIds: [f.team.id],
    });
    expect(otherProject.statusCode).toBe(201);
    const projectId = project.json<{ data: Entity }>().data.id;
    const otherProjectId = otherProject.json<{ data: Entity }>().data.id;
    const milestone = await request(
      'POST',
      `${f.base}/projects/${otherProjectId}/milestones`,
      f.owner,
      { name: 'Other milestone' },
    );
    expect(milestone.statusCode).toBe(201);
    expect(
      (
        await request('POST', f.path, f.owner, {
          teamId: f.team.id,
          title: 'Wrong milestone',
          projectId,
          milestoneId: milestone.json<{ data: Entity }>().data.id,
        })
      ).statusCode,
    ).toBe(404);
    expect((await create(f)).number).toBe(1);
  });

  it('serializes parent and dependency cycle races so only one opposing edge commits', async () => {
    const f = await fixture();
    const a = await create(f);
    const b = await create(f);
    const parents = await Promise.all([
      request('PATCH', `${f.path}/${a.id}`, f.owner, {
        expectedRevision: 1,
        parentId: b.id,
      }),
      request('PATCH', `${f.path}/${b.id}`, f.owner, {
        expectedRevision: 1,
        parentId: a.id,
      }),
    ]);
    expect(parents.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const c = await create(f);
    const d = await create(f);
    const edges = await Promise.all([
      request('POST', `${f.path}/${c.id}/relations`, f.owner, {
        expectedRevision: 1,
        targetIssueId: d.id,
        type: 'BLOCKS',
      }),
      request('POST', `${f.path}/${d.id}/relations`, f.owner, {
        expectedRevision: 1,
        targetIssueId: c.id,
        type: 'BLOCKS',
      }),
    ]);
    expect(edges.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const rows = await database.connection.query<{ count: string }>(
      'SELECT count(*) FROM issue_relations WHERE workspace_id=$1',
      [f.workspaceId],
    );
    expect(Number(rows.rows[0]!.count)).toBe(1);
  });

  it('reauthorizes cached issue writes after membership downgrade', async () => {
    const f = await fixture();
    const member = await join(f);
    const issue = await create(f);
    const key = randomUUID();
    const body = { expectedRevision: 1, title: 'Member changed' };
    expect(
      (await request('PATCH', `${f.path}/${issue.id}`, member.user, body, key))
        .statusCode,
    ).toBe(200);
    await database.connection.query(
      "UPDATE memberships SET role='GUEST' WHERE id=$1",
      [member.membershipId],
    );
    expect(
      (await request('PATCH', `${f.path}/${issue.id}`, member.user, body, key))
        .statusCode,
    ).toBe(404);
  });
  it('transfers with explicit status mapping and clears source-scoped planning and labels', async () => {
    const f = await fixture();
    const destination = await team(f);
    await database.connection.query(
      'UPDATE teams SET cycles_enabled=true WHERE id=$1',
      [f.team.id],
    );
    const cycleId = randomUUID();
    await database.connection.query(
      'INSERT INTO cycles(id,workspace_id,team_id,number,name,starts_at,ends_at) VALUES($1,$2,$3,1,$4,$5,$6)',
      [
        cycleId,
        f.workspaceId,
        f.team.id,
        'Cycle',
        '2026-01-01T00:00:00Z',
        '2026-01-15T00:00:00Z',
      ],
    );
    const project = await request('POST', `${f.base}/projects`, f.owner, {
      name: 'Transfer project',
      teamIds: [f.team.id],
    });
    expect(project.statusCode).toBe(201);
    const projectId = project.json<{ data: Entity }>().data.id;
    const milestone = await request(
      'POST',
      `${f.base}/projects/${projectId}/milestones`,
      f.owner,
      { name: 'Milestone' },
    );
    expect(milestone.statusCode).toBe(201);
    const issue = await create(f, {
      projectId,
      milestoneId: milestone.json<{ data: Entity }>().data.id,
      cycleId,
    });
    const workspaceLabel = randomUUID();
    const sourceLabel = randomUUID();
    await database.connection.query(
      'INSERT INTO labels(id,workspace_id,team_id,name,color) VALUES($1,$2,NULL,$3,$4),($5,$2,$6,$7,$4)',
      [
        workspaceLabel,
        f.workspaceId,
        'Global',
        '#123456',
        sourceLabel,
        f.team.id,
        'Source',
      ],
    );
    await database.connection.query(
      'INSERT INTO issue_labels(id,workspace_id,issue_id,label_id) VALUES($1,$2,$3,$4),($5,$2,$3,$6)',
      [
        randomUUID(),
        f.workspaceId,
        issue.id,
        workspaceLabel,
        randomUUID(),
        sourceLabel,
      ],
    );
    const completed = (await statuses(f, destination.id)).find(
      (x) => x.category === 'COMPLETED',
    )!;
    const r = await request('POST', `${f.path}/${issue.id}/transfer`, f.owner, {
      expectedRevision: issue.revision,
      teamId: destination.id,
      statusId: completed.id,
    });
    expect(r.statusCode).toBe(200);
    expect(r.json<{ data: Entity }>().data).toMatchObject({
      projectId: null,
      milestoneId: null,
      cycleId: null,
      statusId: completed.id,
    });
    expect(
      (
        await database.connection.query<{ label_id: string }>(
          'SELECT label_id FROM issue_labels WHERE issue_id=$1',
          [issue.id],
        )
      ).rows,
    ).toEqual([{ label_id: workspaceLabel }]);
  });

  it('rejects cross-team, disabled and closed cycle assignment', async () => {
    const f = await fixture();
    const otherTeam = await team(f);
    await database.connection.query(
      'UPDATE teams SET cycles_enabled=true WHERE id=ANY($1::text[])',
      [[f.team.id, otherTeam.id]],
    );
    const cycleId = randomUUID();
    const otherCycle = randomUUID();
    await database.connection.query(
      'INSERT INTO cycles(id,workspace_id,team_id,number,name,starts_at,ends_at) VALUES($1,$2,$3,1,$4,$5,$6),($7,$2,$8,1,$4,$5,$6)',
      [
        cycleId,
        f.workspaceId,
        f.team.id,
        'Cycle',
        '2026-01-01T00:00:00Z',
        '2026-01-15T00:00:00Z',
        otherCycle,
        otherTeam.id,
      ],
    );
    expect(
      (
        await request('POST', f.path, f.owner, {
          teamId: f.team.id,
          title: 'Other cycle',
          cycleId: otherCycle,
        })
      ).statusCode,
    ).toBe(409);
    await database.connection.query(
      'UPDATE teams SET cycles_enabled=false WHERE id=$1',
      [f.team.id],
    );
    expect(
      (
        await request('POST', f.path, f.owner, {
          teamId: f.team.id,
          title: 'Disabled',
          cycleId,
        })
      ).statusCode,
    ).toBe(409);
    await database.connection.query(
      'UPDATE teams SET cycles_enabled=true WHERE id=$1',
      [f.team.id],
    );
    await database.connection.query(
      'UPDATE cycles SET completed_at=now() WHERE id=$1',
      [cycleId],
    );
    expect(
      (
        await request('POST', f.path, f.owner, {
          teamId: f.team.id,
          title: 'Closed',
          cycleId,
        })
      ).statusCode,
    ).toBe(409);
  });
  it('rolls back a transfer destination allocation, aliases and source labels on event failure', async () => {
    const f = await fixture();
    const destination = await team(f);
    const issue = await create(f);
    const labelId = randomUUID();
    await database.connection.query(
      'INSERT INTO labels(id,workspace_id,team_id,name,color) VALUES($1,$2,$3,$4,$5)',
      [labelId, f.workspaceId, f.team.id, 'Rollback label', '#123456'],
    );
    await database.connection.query(
      'INSERT INTO issue_labels(id,workspace_id,issue_id,label_id) VALUES($1,$2,$3,$4)',
      [randomUUID(), f.workspaceId, issue.id, labelId],
    );
    const spy = jest
      .spyOn(events, 'append')
      .mockRejectedValueOnce(new Error('Injected transfer event failure'));
    try {
      expect(
        (
          await request('POST', `${f.path}/${issue.id}/transfer`, f.owner, {
            expectedRevision: issue.revision,
            teamId: destination.id,
          })
        ).statusCode,
      ).toBe(500);
    } finally {
      spy.mockRestore();
    }
    const current = (
      await request('GET', `${f.path}/${issue.id}`, f.owner)
    ).json<{ data: Entity }>().data;
    expect(current).toEqual(issue);
    expect(
      (
        await database.connection.query(
          'SELECT label_id FROM issue_labels WHERE issue_id=$1',
          [issue.id],
        )
      ).rows,
    ).toEqual([{ label_id: labelId }]);
    expect(
      (
        await database.connection.query(
          'SELECT identifier FROM issue_identifiers WHERE issue_id=$1',
          [issue.id],
        )
      ).rows,
    ).toEqual([{ identifier: issue.identifier }]);
    expect((await create(f, { teamId: destination.id })).number).toBe(1);
  });
  it('reauthorizes private parent access before replaying cached creates and parent changes', async () => {
    const f = await fixture();
    const member = await join(f);
    const privateTeam = await team(f, 'PRIVATE');
    await database.connection.query(
      'INSERT INTO team_memberships(id,workspace_id,team_id,membership_id) VALUES($1,$2,$3,$4)',
      [randomUUID(), f.workspaceId, privateTeam.id, member.membershipId],
    );
    const parent = await create(f, { teamId: privateTeam.id });
    const createKey = randomUUID();
    const body = {
      teamId: f.team.id,
      title: 'Visible child',
      parentId: parent.id,
    };
    const child = await request('POST', f.path, member.user, body, createKey);
    expect(child.statusCode).toBe(201);
    const other = await create(f);
    const updateKey = randomUUID();
    const update = { expectedRevision: 1, parentId: parent.id };
    expect(
      (
        await request(
          'PATCH',
          `${f.path}/${other.id}`,
          member.user,
          update,
          updateKey,
        )
      ).statusCode,
    ).toBe(200);
    await database.connection.query(
      'DELETE FROM team_memberships WHERE team_id=$1 AND membership_id=$2',
      [privateTeam.id, member.membershipId],
    );
    expect(
      (await request('GET', `${f.path}/${other.id}`, member.user)).statusCode,
    ).toBe(404);
    const visible = await request('GET', f.path, member.user);
    expect(visible.statusCode).toBe(200);
    expect(
      visible.json<{ data: Entity[]; meta: { total: number } }>().data,
    ).toEqual([]);
    expect(visible.json<{ meta: { total: number } }>().meta.total).toBe(0);
    expect(
      (
        await request(
          'GET',
          `${f.path}/identifier/${other.identifier}`,
          member.user,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await request('POST', f.path, member.user, body, createKey)).statusCode,
    ).toBe(404);
    expect(
      (
        await request(
          'PATCH',
          `${f.path}/${other.id}`,
          member.user,
          update,
          updateKey,
        )
      ).statusCode,
    ).toBe(404);
  });
  it('hides inaccessible relation targets and reauthorizes target permissions before cached replay', async () => {
    const f = await fixture();
    const member = await join(f);
    const privateTeam = await team(f, 'PRIVATE');
    await database.connection.query(
      'INSERT INTO team_memberships(id,workspace_id,team_id,membership_id) VALUES($1,$2,$3,$4)',
      [randomUUID(), f.workspaceId, privateTeam.id, member.membershipId],
    );
    const source = await create(f);
    const target = await create(f, { teamId: privateTeam.id });
    const key = randomUUID();
    const body = {
      expectedRevision: 1,
      targetIssueId: target.id,
      type: 'BLOCKS',
    };
    expect(
      (
        await request(
          'POST',
          `${f.path}/${source.id}/relations`,
          member.user,
          body,
          key,
        )
      ).statusCode,
    ).toBe(201);
    await database.connection.query(
      'DELETE FROM team_memberships WHERE team_id=$1 AND membership_id=$2',
      [privateTeam.id, member.membershipId],
    );
    expect(
      (await request('GET', `${f.path}/${source.id}`, member.user)).statusCode,
    ).toBe(200);
    const relations = await request(
      'GET',
      `${f.path}/${source.id}/relations`,
      member.user,
    );
    expect(relations.statusCode).toBe(200);
    expect(relations.json<{ data: unknown[] }>().data).toEqual([]);
    expect(
      (
        await request(
          'POST',
          `${f.path}/${source.id}/relations`,
          member.user,
          body,
          key,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await database.connection.query(
          'SELECT id FROM issue_relations WHERE workspace_id=$1',
          [f.workspaceId],
        )
      ).rows,
    ).toHaveLength(1);
  });
});
