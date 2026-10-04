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
import { CycleService } from '../src/modules/cycles/application/cycle.service';
import { IssueMutationService } from '../src/modules/issues/application/issue-mutation.service';
import { prepareIntegrationDatabase } from './helpers/integration-environment';
type User = { accessToken: string; user: { id: string } };
type Cycle = {
  id: string;
  revision: number;
  startsAt: string;
  endsAt: string;
  completedAt: string | null;
  startedAt: string | null;
  completionNextCycleId: string | null;
  schedulerError: string | null;
};
type Issue = {
  id: string;
  revision: number;
  cycleId: string | null;
  identifier: string;
};
describe('M08 cycles PostgreSQL HTTP contracts', () => {
  let app: NestFastifyApplication;
  let database: Awaited<ReturnType<typeof prepareIntegrationDatabase>>;
  let requestNumber = 0;
  beforeAll(async () => {
    database = await prepareIntegrationDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_MAIL_SENDER)
      .useValue({ send: () => Promise.resolve() })
      .compile();
    (await module.resolve(PinoLogger)).logger.level = 'silent';
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
      remoteAddress: `10.81.${Math.floor(++requestNumber / 250)}.${(requestNumber % 250) + 1}`,
      ...(payload ? { payload } : {}),
    });
  }
  async function signup(): Promise<User> {
    const email = `cycles-${randomUUID()}@example.test`;
    const response = await request('POST', '/auth/signup', undefined, {
      email,
      password: 'Integration-password-2026',
      fullName: 'Cycle tester',
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
  async function fixture(visibility = 'WORKSPACE') {
    const owner = await signup();
    const workspace = await request('POST', '/workspaces', owner, {
      name: 'Cycle workspace',
      slug: `cycles-${randomUUID()}`,
    });
    expect(workspace.statusCode).toBe(201);
    const workspaceId = workspace.json<{ data: { id: string } }>().data.id;
    const teamResponse = await request(
      'POST',
      `/workspaces/${workspaceId}/teams`,
      owner,
      {
        name: 'Cycle team',
        key: `C${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
        visibility,
      },
    );
    expect(teamResponse.statusCode).toBe(201);
    const teamId = teamResponse.json<{ data: { id: string } }>().data.id;
    const teamPath = `/workspaces/${workspaceId}/teams/${teamId}`;
    const settings = await request('PATCH', `${teamPath}/settings`, owner, {
      cyclesEnabled: true,
      timezone: 'UTC',
      cycleDurationWeeks: 1,
      cycleStartDay: 1,
      cycleCooldownDays: 0,
      upcomingCyclesCount: 3,
    });
    if (settings.statusCode !== 200) throw new Error(settings.body);
    expect(settings.statusCode).toBe(200);
    return { owner, workspaceId, teamId, teamPath, path: `${teamPath}/cycles` };
  }
  async function create(
    path: string,
    owner: User,
    startsAt = '2026-01-05T00:00:00Z',
    endsAt = '2026-01-12T00:00:00Z',
  ) {
    const response = await request('POST', path, owner, {
      name: 'Cycle',
      startsAt,
      endsAt,
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ data: Cycle }>().data;
  }
  async function issue(
    workspaceId: string,
    teamId: string,
    cycleId: string,
    owner: User,
    statusId?: string,
  ) {
    const response = await request(
      'POST',
      `/workspaces/${workspaceId}/issues`,
      owner,
      {
        teamId,
        title: 'Cycle work',
        cycleId,
        ...(statusId ? { statusId } : {}),
      },
    );
    expect(response.statusCode).toBe(201);
    return response.json<{ data: Issue }>().data;
  }
  async function join(workspaceId: string, role = 'MEMBER') {
    const user = await signup();
    const membershipId = randomUUID();
    await database.connection.query(
      'INSERT INTO memberships(id,workspace_id,user_id,role) VALUES($1,$2,$3,$4)',
      [membershipId, workspaceId, user.user.id, role],
    );
    return { user, membershipId };
  }

  it('authenticates, hides private cycles and denies guest writes', async () => {
    const f = await fixture('PRIVATE');
    const cycle = await create(f.path, f.owner);
    const guest = await join(f.workspaceId, 'GUEST');
    expect((await request('GET', f.path)).statusCode).toBe(401);
    expect(
      (await request('GET', `${f.path}/${cycle.id}`, guest.user)).statusCode,
    ).toBe(404);
    expect(
      (
        await request('POST', `${f.teamPath}/members`, f.owner, {
          membershipId: guest.membershipId,
          role: 'MEMBER',
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (await request('GET', `${f.path}/${cycle.id}`, guest.user)).statusCode,
    ).toBe(200);
    expect(
      (
        await request('POST', f.path, guest.user, {
          name: 'Denied',
          startsAt: '2026-03-01T00:00:00Z',
          endsAt: '2026-03-08T00:00:00Z',
        })
      ).statusCode,
    ).toBe(403);
  });
  it('allows adjacent half-open windows and rejects sequential and concurrent overlaps', async () => {
    const f = await fixture();
    await create(f.path, f.owner);
    await create(
      f.path,
      f.owner,
      '2026-01-12T00:00:00Z',
      '2026-01-19T00:00:00Z',
    );
    expect(
      (
        await request('POST', f.path, f.owner, {
          name: 'Overlap',
          startsAt: '2026-01-11T23:59:00Z',
          endsAt: '2026-01-20T00:00:00Z',
        })
      ).statusCode,
    ).toBe(409);
    const payload = {
      name: 'Concurrent',
      startsAt: '2026-02-02T00:00:00Z',
      endsAt: '2026-02-09T00:00:00Z',
    };
    const responses = await Promise.all([
      request('POST', f.path, f.owner, payload),
      request('POST', f.path, f.owner, payload),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    await expect(
      database.connection.query(
        'INSERT INTO cycles(id,workspace_id,team_id,number,name,starts_at,ends_at) VALUES($1,$2,$3,999,$4,$5,$6)',
        [
          randomUUID(),
          f.workspaceId,
          f.teamId,
          'SQL overlap',
          '2026-01-06',
          '2026-01-08',
        ],
      ),
    ).rejects.toMatchObject({ code: '23P01' });
  });
  it('plans local dates across DST and schedules cooldown weekdays', async () => {
    const f = await fixture();
    expect(
      (
        await request('PATCH', `${f.teamPath}/settings`, f.owner, {
          timezone: 'America/New_York',
        })
      ).statusCode,
    ).toBe(200);
    const response = await request('POST', f.path, f.owner, {
      name: 'DST',
      startDate: '2026-03-08',
      endDate: '2026-03-15',
    });
    expect(response.statusCode).toBe(201);
    const cycle = response.json<{ data: Cycle }>().data;
    expect(cycle.startsAt).toBe('2026-03-08T05:00:00.000Z');
    expect(cycle.endsAt).toBe('2026-03-15T04:00:00.000Z');
    const scheduled = await request('POST', `${f.path}/schedule`, f.owner, {
      anchorDate: '2026-03-16',
      count: 2,
    });
    expect(scheduled.statusCode).toBe(201);
    const rows = scheduled.json<{ data: Cycle[] }>().data;
    expect(rows).toHaveLength(2);
    expect(rows[1]!.startsAt).toBe(rows[0]!.endsAt);
  });
  it('validates date pairs and protects optimistic revisions', async () => {
    const f = await fixture();
    expect(
      (
        await request('POST', f.path, f.owner, {
          name: 'Incomplete',
          startDate: '2026-01-01',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request('POST', f.path, f.owner, {
          name: 'Impossible',
          startDate: '2026-02-30',
          endDate: '2026-03-07',
        })
      ).statusCode,
    ).toBe(400);
    const cycle = await create(f.path, f.owner);
    const updated = await request('PATCH', `${f.path}/${cycle.id}`, f.owner, {
      expectedRevision: 1,
      name: 'Renamed',
    });
    expect(updated.statusCode).toBe(200);
    expect(
      (
        await request('PATCH', `${f.path}/${cycle.id}`, f.owner, {
          expectedRevision: 1,
          name: 'Stale',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request('PATCH', `${f.path}/${cycle.id}`, f.owner, {
          name: 'No revision',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request('PATCH', `${f.path}/${cycle.id}`, f.owner, {
          expectedRevision: 2,
          name: null,
        })
      ).statusCode,
    ).toBe(400);
  });

  it('starts a current cycle once and rejects future starts and assigned-window changes', async () => {
    const f = await fixture();
    const now = Date.now();
    const cycle = await create(
      f.path,
      f.owner,
      new Date(now - 3_600_000).toISOString(),
      new Date(now + 3_600_000).toISOString(),
    );
    const first = await request(
      'POST',
      `${f.path}/${cycle.id}/start`,
      f.owner,
      { expectedRevision: 1 },
    );
    expect(first.statusCode).toBe(200);
    expect(first.json<{ data: Cycle }>().data.startedAt).not.toBeNull();
    const again = await request(
      'POST',
      `${f.path}/${cycle.id}/start`,
      f.owner,
      { expectedRevision: 2 },
    );
    expect(again.statusCode).toBe(200);
    expect(
      (
        await database.connection.query(
          'SELECT id FROM events WHERE aggregate_id=$1 AND event_type=$2',
          [cycle.id, 'cycle.started'],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await request('PATCH', `${f.path}/${cycle.id}`, f.owner, {
          expectedRevision: 2,
          startsAt: new Date(now - 7200000).toISOString(),
          endsAt: new Date(now + 3600000).toISOString(),
        })
      ).statusCode,
    ).toBe(409);
    const future = await create(
      f.path,
      f.owner,
      '2027-01-04T00:00:00Z',
      '2027-01-11T00:00:00Z',
    );
    expect(
      (
        await request('POST', `${f.path}/${future.id}/start`, f.owner, {
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(409);
    const planned = await create(
      f.path,
      f.owner,
      '2026-01-05T00:00:00Z',
      '2026-01-12T00:00:00Z',
    );
    await issue(f.workspaceId, f.teamId, planned.id, f.owner);
    expect(
      (
        await request('PATCH', `${f.path}/${planned.id}`, f.owner, {
          expectedRevision: 1,
          startDate: '2026-01-04',
          endDate: '2026-01-11',
        })
      ).statusCode,
    ).toBe(409);
  });

  it('paginates cycle ties without leaking private team catalogs', async () => {
    const f = await fixture();
    const a = await create(f.path, f.owner);
    const b = await create(
      f.path,
      f.owner,
      '2026-01-12T00:00:00Z',
      '2026-01-19T00:00:00Z',
    );
    await database.connection.query(
      "UPDATE cycles SET created_at='2026-01-01T00:00:00.123456Z' WHERE team_id=$1",
      [f.teamId],
    );
    const first = await request('GET', `${f.path}?limit=1`, f.owner);
    expect(first.statusCode).toBe(200);
    const firstBody = first.json<{
      data: Cycle[];
      meta: { nextCursor: string; total: number };
    }>();
    expect(firstBody.meta.total).toBe(2);
    const second = await request(
      'GET',
      `${f.path}?limit=1&cursor=${firstBody.meta.nextCursor}`,
      f.owner,
    );
    expect(second.statusCode).toBe(200);
    const ids = [
      firstBody.data[0]!.id,
      second.json<{ data: Cycle[] }>().data[0]!.id,
    ];
    expect(new Set(ids)).toEqual(new Set([a.id, b.id]));
  });
  it('rolls only active unstarted/started issues with one history and fact per issue', async () => {
    const f = await fixture();
    const source = await create(f.path, f.owner);
    const destination = await create(
      f.path,
      f.owner,
      '2026-01-12T00:00:00Z',
      '2026-01-19T00:00:00Z',
    );
    const statuses = await database.connection.query<{
      id: string;
      category: string;
    }>('SELECT id,category FROM issue_statuses WHERE team_id=$1', [f.teamId]);
    const values = new Map<string, Issue>();
    for (const status of statuses.rows)
      values.set(
        status.category,
        await issue(f.workspaceId, f.teamId, source.id, f.owner, status.id),
      );
    const archived = await issue(f.workspaceId, f.teamId, source.id, f.owner);
    const trashed = await issue(f.workspaceId, f.teamId, source.id, f.owner);
    expect(
      (
        await request(
          'POST',
          `/workspaces/${f.workspaceId}/issues/${archived.id}/archive`,
          f.owner,
          { expectedRevision: 1 },
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          'DELETE',
          `/workspaces/${f.workspaceId}/issues/${trashed.id}`,
          f.owner,
          { expectedRevision: 1 },
        )
      ).statusCode,
    ).toBe(200);
    const complete = await request(
      'POST',
      `${f.path}/${source.id}/complete`,
      f.owner,
      { expectedRevision: 1, nextCycleId: destination.id },
    );
    expect(complete.statusCode).toBe(200);
    expect(
      complete.json<{ data: { nextCycleId: string } }>().data.nextCycleId,
    ).toBe(destination.id);
    const rows = await database.connection.query<{
      id: string;
      cycle_id: string;
      revision: number;
    }>('SELECT id,cycle_id,revision FROM issues WHERE team_id=$1', [f.teamId]);
    for (const category of ['UNSTARTED', 'STARTED']) {
      const moved = rows.rows.find(
        (row) => row.id === values.get(category)!.id,
      )!;
      expect(moved.cycle_id).toBe(destination.id);
      expect(moved.revision).toBe(2);
    }
    for (const category of ['BACKLOG', 'COMPLETED', 'CANCELED', 'DUPLICATE'])
      expect(
        rows.rows.find((row) => row.id === values.get(category)!.id)!.cycle_id,
      ).toBe(source.id);
    expect(rows.rows.find((row) => row.id === archived.id)!.cycle_id).toBe(
      source.id,
    );
    expect(rows.rows.find((row) => row.id === trashed.id)!.cycle_id).toBe(
      source.id,
    );
    const history = await database.connection.query(
      'SELECT * FROM cycle_rollovers WHERE from_cycle_id=$1',
      [source.id],
    );
    expect(history.rows).toHaveLength(2);
    const facts = await database.connection.query(
      'SELECT * FROM events WHERE workspace_id=$1 AND event_type=$2',
      [f.workspaceId, 'issue.cycle_changed'],
    );
    expect(facts.rows).toHaveLength(2);
    await expect(
      database.connection.query(
        'UPDATE cycle_rollovers SET to_cycle_id=from_cycle_id WHERE from_cycle_id=$1',
        [source.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('persists identical completion results on replay including zero-issue explicit destination', async () => {
    const f = await fixture();
    const source = await create(f.path, f.owner);
    const next = await create(
      f.path,
      f.owner,
      '2026-01-12T00:00:00Z',
      '2026-01-19T00:00:00Z',
    );
    const key = randomUUID();
    const payload = { expectedRevision: 1, nextCycleId: next.id };
    const first = await request(
      'POST',
      `${f.path}/${source.id}/complete`,
      f.owner,
      payload,
      key,
    );
    expect(first.statusCode).toBe(200);
    const replay = await request(
      'POST',
      `${f.path}/${source.id}/complete`,
      f.owner,
      payload,
      key,
    );
    expect(replay.statusCode).toBe(200);
    expect(replay.json<{ data: unknown }>().data).toEqual(
      first.json<{ data: unknown }>().data,
    );
    const retry = await request(
      'POST',
      `${f.path}/${source.id}/complete`,
      f.owner,
      payload,
    );
    expect(retry.statusCode).toBe(200);
    expect(retry.json<{ data: unknown }>().data).toEqual(
      first.json<{ data: unknown }>().data,
    );
    expect(
      (
        await database.connection.query(
          'SELECT id FROM events WHERE aggregate_id=$1 AND event_type=$2',
          [source.id, 'cycle.completed'],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it('serializes concurrent manual and scheduler completion exactly once', async () => {
    const f = await fixture();
    const source = await create(f.path, f.owner);
    await issue(f.workspaceId, f.teamId, source.id, f.owner);
    const [manual] = await Promise.all([
      request('POST', `${f.path}/${source.id}/complete`, f.owner, {
        expectedRevision: 1,
      }),
      app.get(CycleService).runScheduled(),
    ]);
    expect(manual.statusCode).toBe(200);
    expect(
      (
        await database.connection.query(
          'SELECT id FROM cycle_rollovers WHERE from_cycle_id=$1',
          [source.id],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await database.connection.query(
          'SELECT id FROM events WHERE aggregate_id=$1 AND event_type=$2',
          [source.id, 'cycle.completed'],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it('rolls back failure atomically and exposes scheduler failure until retry succeeds', async () => {
    const f = await fixture();
    const source = await create(f.path, f.owner);
    const work = await issue(f.workspaceId, f.teamId, source.id, f.owner);
    const spy = jest
      .spyOn(app.get(IssueMutationService), 'fact')
      .mockRejectedValueOnce(new Error('Injected rollover failure'));
    const failureKey = randomUUID();
    const failed = await request(
      'POST',
      `${f.path}/${source.id}/complete`,
      f.owner,
      { expectedRevision: 1 },
      failureKey,
    );
    expect(failed.statusCode).toBe(500);
    spy.mockRestore();
    expect(
      (
        await database.connection.query(
          'SELECT cycle_id,revision FROM issues WHERE id=$1',
          [work.id],
        )
      ).rows[0],
    ).toEqual({ cycle_id: source.id, revision: 1 });
    expect(
      (
        await database.connection.query(
          'SELECT id FROM cycle_rollovers WHERE from_cycle_id=$1',
          [source.id],
        )
      ).rows,
    ).toHaveLength(0);
    const again = jest
      .spyOn(app.get(IssueMutationService), 'fact')
      .mockRejectedValueOnce(new Error('Scheduler failure'));
    await app.get(CycleService).runScheduled();
    again.mockRestore();
    const error = await request('GET', `${f.path}/${source.id}`, f.owner);
    expect(error.json<{ data: Cycle }>().data.schedulerError).toBe(
      'SCHEDULE_FAILED',
    );
    expect(error.json<{ data: Cycle }>().data.revision).toBe(1);
    await app.get(CycleService).runScheduled();
    const recovered = await request('GET', `${f.path}/${source.id}`, f.owner);
    expect(recovered.json<{ data: Cycle }>().data.completedAt).not.toBeNull();
    expect(recovered.json<{ data: Cycle }>().data.schedulerError).toBeNull();
    const retry = await request(
      'POST',
      `${f.path}/${source.id}/complete`,
      f.owner,
      { expectedRevision: 1 },
      failureKey,
    );
    expect(retry.statusCode).toBe(200);
    expect(
      retry.json<{ data: { cycle: Cycle } }>().data.cycle.completedAt,
    ).toBe(recovered.json<{ data: Cycle }>().data.completedAt);
  });
  it('bounds missed-schedule catch-up to one completion per team per sweep', async () => {
    const f = await fixture();
    const first = await create(f.path, f.owner);
    const second = await create(
      f.path,
      f.owner,
      '2026-01-12T00:00:00Z',
      '2026-01-19T00:00:00Z',
    );
    await issue(f.workspaceId, f.teamId, first.id, f.owner);
    await app.get(CycleService).runScheduled();
    expect(
      (await request('GET', `${f.path}/${second.id}`, f.owner)).json<{
        data: Cycle;
      }>().data.completedAt,
    ).toBeNull();
    await app.get(CycleService).runScheduled();
    expect(
      (await request('GET', `${f.path}/${second.id}`, f.owner)).json<{
        data: Cycle;
      }>().data.completedAt,
    ).not.toBeNull();
  });

  it('maintains the configured future pool exactly once under concurrent sweeps', async () => {
    const f = await fixture();
    await Promise.all([
      app.get(CycleService).runScheduled(),
      app.get(CycleService).runScheduled(),
    ]);
    const result = await database.connection.query<{ count: number }>(
      'SELECT count(*)::int count FROM cycles WHERE team_id=$1 AND starts_at>now() AND canceled_at IS NULL AND completed_at IS NULL',
      [f.teamId],
    );
    expect(result.rows[0]!.count).toBe(3);
    await app.get(CycleService).runScheduled();
    expect(
      (
        await database.connection.query(
          'SELECT id FROM cycles WHERE team_id=$1',
          [f.teamId],
        )
      ).rows,
    ).toHaveLength(3);
    const facts = await database.connection.query(
      'SELECT actor_id FROM events WHERE workspace_id=$1 AND event_type=$2',
      [f.workspaceId, 'cycle.created'],
    );
    expect(facts.rows).toHaveLength(3);
    expect(
      facts.rows.every(
        (row: { actor_id: string | null }) => row.actor_id === null,
      ),
    ).toBe(true);
  });
  it('rejects cross-team destinations and preserves history after later issue transfer', async () => {
    const f = await fixture();
    const source = await create(f.path, f.owner);
    const next = await create(
      f.path,
      f.owner,
      '2026-01-12T00:00:00Z',
      '2026-01-19T00:00:00Z',
    );
    const work = await issue(f.workspaceId, f.teamId, source.id, f.owner);
    const otherResponse = await request(
      'POST',
      `/workspaces/${f.workspaceId}/teams`,
      f.owner,
      {
        name: 'Other',
        key: `D${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
      },
    );
    expect(otherResponse.statusCode).toBe(201);
    const other = otherResponse.json<{ data: { id: string } }>().data;
    const otherPath = `/workspaces/${f.workspaceId}/teams/${other.id}/cycles`;
    const foreign = await create(otherPath, f.owner);
    expect(
      (
        await request('POST', `${f.path}/${source.id}/complete`, f.owner, {
          expectedRevision: 1,
          nextCycleId: foreign.id,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request('POST', `${f.path}/${source.id}/complete`, f.owner, {
          expectedRevision: 1,
          nextCycleId: next.id,
        })
      ).statusCode,
    ).toBe(200);
    const transferred = await request(
      'POST',
      `/workspaces/${f.workspaceId}/issues/${work.id}/transfer`,
      f.owner,
      { expectedRevision: 2, teamId: other.id },
    );
    expect(transferred.statusCode).toBe(200);
    expect(
      (
        await database.connection.query(
          'SELECT team_id,from_cycle_id,to_cycle_id FROM cycle_rollovers WHERE issue_id=$1',
          [work.id],
        )
      ).rows[0],
    ).toEqual({
      team_id: f.teamId,
      from_cycle_id: source.id,
      to_cycle_id: next.id,
    });
  });
  it('prevents cancellation of assigned work and accepts empty cycle cancellation', async () => {
    const f = await fixture();
    const source = await create(f.path, f.owner);
    await issue(f.workspaceId, f.teamId, source.id, f.owner);
    expect(
      (
        await request('DELETE', `${f.path}/${source.id}`, f.owner, {
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(409);
    const empty = await create(
      f.path,
      f.owner,
      '2026-01-12T00:00:00Z',
      '2026-01-19T00:00:00Z',
    );
    expect(
      (
        await request('DELETE', `${f.path}/${empty.id}`, f.owner, {
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request('POST', `${f.path}/${empty.id}/complete`, f.owner, {
          expectedRevision: 2,
        })
      ).statusCode,
    ).toBe(409);
    await create(
      f.path,
      f.owner,
      '2026-01-12T00:00:00Z',
      '2026-01-19T00:00:00Z',
    );
  });
  it('reports counts using authorized project issue visibility', async () => {
    const f = await fixture();
    const source = await create(f.path, f.owner);
    const reader = await join(f.workspaceId);
    await issue(f.workspaceId, f.teamId, source.id, f.owner);
    const privateResponse = await request(
      'POST',
      `/workspaces/${f.workspaceId}/teams`,
      f.owner,
      {
        name: 'Private',
        key: `P${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
        visibility: 'PRIVATE',
      },
    );
    expect(privateResponse.statusCode).toBe(201);
    const privateTeamId = privateResponse.json<{ data: { id: string } }>().data
      .id;
    const projectResponse = await request(
      'POST',
      `/workspaces/${f.workspaceId}/projects`,
      f.owner,
      { name: 'Private project', teamIds: [f.teamId, privateTeamId] },
    );
    expect(projectResponse.statusCode).toBe(201);
    const projectId = projectResponse.json<{ data: { id: string } }>().data.id;
    const hidden = await request(
      'POST',
      `/workspaces/${f.workspaceId}/issues`,
      f.owner,
      {
        teamId: f.teamId,
        title: 'Hidden project work',
        cycleId: source.id,
        projectId,
      },
    );
    expect(hidden.statusCode).toBe(201);
    const ownerReport = await request(
      'GET',
      `${f.path}/${source.id}/report`,
      f.owner,
    );
    expect(ownerReport.statusCode).toBe(200);
    expect(ownerReport.json<{ data: { total: number } }>().data.total).toBe(2);
    const readerReport = await request(
      'GET',
      `${f.path}/${source.id}/report`,
      reader.user,
    );
    expect(readerReport.statusCode).toBe(200);
    expect(readerReport.json<{ data: { total: number } }>().data.total).toBe(1);
  });
});
