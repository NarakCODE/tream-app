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
import { DatabaseService } from '../src/database/database.service';
import { TeamIssueNumberAllocator } from '../src/modules/teams/application/team-issue-number-allocator';
import { EventWriter } from '../src/modules/eventing/application/event-writer.service';
import { prepareIntegrationDatabase } from './helpers/integration-environment';

type User = { accessToken: string; user: { id: string } };
type Resource = {
  id: string;
  key: string;
  isDefault: boolean;
  position: number;
};

describe('M05 teams PostgreSQL HTTP contracts', () => {
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
      remoteAddress: `10.50.${Math.floor(++requestNumber / 250)}.${(requestNumber % 250) + 1}`,
      ...(payload ? { payload } : {}),
    });
  }
  async function signup(): Promise<User> {
    const email = `teams-${randomUUID()}@example.test`;
    const response = await request('POST', '/auth/signup', undefined, {
      email,
      password: 'Integration-password-2026',
      fullName: 'Teams tester',
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
  async function fixture() {
    const owner = await signup();
    const response = await request('POST', '/workspaces', owner, {
      name: 'Teams workspace',
      slug: `teams-${randomUUID()}`,
    });
    expect(response.statusCode).toBe(201);
    const workspaceId = response.json<{ data: Resource }>().data.id;
    const path = `/workspaces/${workspaceId}/teams`;
    return { owner, workspaceId, path };
  }
  async function join(workspaceId: string, role = 'MEMBER') {
    const user = await signup();
    const membershipId = randomUUID();
    await database.connection.query(
      'INSERT INTO memberships(id,workspace_id,user_id,role) VALUES ($1,$2,$3,$4)',
      [membershipId, workspaceId, user.user.id, role],
    );
    return { user, membershipId };
  }
  async function team(
    path: string,
    owner: User,
    key = `T${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    visibility = 'WORKSPACE',
  ) {
    const response = await request('POST', path, owner, {
      name: 'Team',
      key,
      visibility,
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ data: Resource }>().data;
  }
  async function status(path: string, owner: User, name: string) {
    const response = await request('POST', `${path}/statuses`, owner, {
      name,
      category: 'UNSTARTED',
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ data: Resource }>().data;
  }
  async function defaults(teamId: string) {
    const result = await database.connection.query(
      'SELECT id FROM issue_statuses WHERE team_id=$1 AND is_default AND retired_at IS NULL',
      [teamId],
    );
    return result.rows as { id: string }[];
  }

  it('requires authentication and persists a usable team with one default', async () => {
    const { owner, path } = await fixture();
    expect((await request('GET', path)).statusCode).toBe(401);
    const created = await team(path, owner);
    expect(await defaults(created.id)).toHaveLength(1);
    const statuses = await request(
      'GET',
      `${path}/${created.id}/statuses`,
      owner,
    );
    expect(statuses.statusCode).toBe(200);
    expect(
      statuses
        .json<{ data: Resource[] }>()
        .data.filter((item) => item.isDefault),
    ).toHaveLength(1);
  });
  it('hides private teams from nonmembers including workspace owners and excludes them from counts/cursors', async () => {
    const { owner, workspaceId, path } = await fixture();
    const admin = await join(workspaceId, 'ADMIN');
    const member = await join(workspaceId);
    const guest = await join(workspaceId, 'GUEST');
    const privateTeam = await team(path, admin.user, undefined, 'PRIVATE');
    await team(path, owner);
    await team(path, owner);
    for (const user of [owner, member.user, guest.user]) {
      expect(
        (await request('GET', `${path}/${privateTeam.id}`, user)).statusCode,
      ).toBe(404);
      expect(
        (await request('GET', `${path}/${privateTeam.id}/statuses`, user))
          .statusCode,
      ).toBe(404);
    }
    const first = (await request('GET', `${path}?limit=1`, member.user)).json<{
      data: Resource[];
      meta: { total: number; nextCursor: string; hasNext: boolean };
    }>();
    expect(first.meta).toMatchObject({ total: 2, hasNext: true });
    expect(first.data).toHaveLength(1);
    const second = (
      await request(
        'GET',
        `${path}?limit=1&cursor=${encodeURIComponent(first.meta.nextCursor)}`,
        member.user,
      )
    ).json<{ data: Resource[]; meta: { total: number; hasNext: boolean } }>();
    expect(second.meta).toMatchObject({ total: 2, hasNext: false });
    expect(second.data[0]!.id).not.toBe(first.data[0]!.id);
    expect(
      (await request('GET', path, guest.user)).json<{ data: Resource[] }>()
        .data,
    ).toEqual([]);
  });
  it('limits creation to administrators and refreshes authorization before cached replay', async () => {
    const { owner, workspaceId, path } = await fixture();
    const admin = await join(workspaceId, 'ADMIN');
    const member = await join(workspaceId);
    expect(
      (
        await request('POST', path, member.user, {
          name: 'Denied',
          key: 'DENIED',
        })
      ).statusCode,
    ).toBe(403);
    const key = randomUUID();
    const payload = { name: 'Replay team', key: 'REPLAY' };
    const responses = await Promise.all([
      request('POST', path, admin.user, payload, key),
      request('POST', path, admin.user, payload, key),
    ]);
    expect(responses.map((item) => item.statusCode)).toEqual([201, 201]);
    expect(responses[0].json<{ data: Resource }>().data).toEqual(
      responses[1].json<{ data: Resource }>().data,
    );
    const replayTeamId = responses[0].json<{ data: Resource }>().data.id;
    const facts = await database.connection.query(
      'SELECT event_type,aggregate_version FROM events WHERE aggregate_id=$1',
      [replayTeamId],
    );
    expect(facts.rows).toEqual([
      { event_type: 'team.created', aggregate_version: 1 },
    ]);
    expect(
      (
        await database.connection.query(
          'SELECT id FROM audit_logs WHERE target_id=$1',
          [replayTeamId],
        )
      ).rows,
    ).toHaveLength(1);

    expect(
      (
        await request(
          'POST',
          path,
          admin.user,
          { ...payload, name: 'Changed' },
          key,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${workspaceId}/members/${admin.membershipId}`,
          owner,
          { role: 'MEMBER' },
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await request('POST', path, admin.user, payload, key)).statusCode,
    ).toBe(403);
  });
  it('reserves keys permanently and refuses key changes or invalid canonical keys', async () => {
    const { owner, path } = await fixture();
    for (const key of ['lower', 'WITH SPACE', '', '-BAD']) {
      expect(
        (await request('POST', path, owner, { name: 'Bad', key })).statusCode,
      ).toBe(400);
    }
    const created = await team(path, owner, 'PERMANENT');
    expect(
      (
        await request('PATCH', `${path}/${created.id}`, owner, {
          key: 'RENAMED',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await request('DELETE', `${path}/${created.id}`, owner)).statusCode,
    ).toBe(200);
    const retiredList = (await request('GET', path, owner)).json<{
      data: Resource[];
      meta: { total: number };
    }>();
    expect(retiredList.data).toEqual([]);
    expect(retiredList.meta.total).toBe(0);
    expect(
      (await request('POST', path, owner, { name: 'Reuse', key: 'PERMANENT' }))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await request('POST', `${path}/${created.id}/statuses`, owner, {
          name: 'Retired work',
          category: 'STARTED',
        })
      ).statusCode,
    ).toBe(409);
    await expect(
      database.connection.query('UPDATE teams SET key=$1 WHERE id=$2', [
        'MUTATED',
        created.id,
      ]),
    ).rejects.toBeDefined();
  });
  it('enforces team administration, final administrator and same-workspace membership', async () => {
    const { owner, workspaceId, path } = await fixture();
    const member = await join(workspaceId);
    const foreign = await fixture();
    const foreignMember = await join(foreign.workspaceId);
    const created = await team(path, owner, undefined, 'PRIVATE');
    const detail = `${path}/${created.id}`;
    expect(
      (
        await request('POST', `${detail}/members`, owner, {
          membershipId: foreignMember.membershipId,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request('POST', `${detail}/members`, owner, {
          membershipId: member.membershipId,
        })
      ).statusCode,
    ).toBe(201);
    expect((await request('GET', detail, member.user)).statusCode).toBe(200);
    expect(
      (await request('PATCH', detail, member.user, { name: 'Denied' }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          'PATCH',
          `${detail}/members/${member.membershipId}`,
          member.user,
          { role: 'ADMIN' },
        )
      ).statusCode,
    ).toBe(403);
    const ownerMembership = (
      await database.connection.query<{ id: string }>(
        'SELECT id FROM memberships WHERE workspace_id=$1 AND user_id=$2',
        [workspaceId, owner.user.id],
      )
    ).rows[0]!.id;
    expect(
      (await request('DELETE', `${detail}/members/${ownerMembership}`, owner))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await request(
          'DELETE',
          `${detail}/members/${member.membershipId}`,
          owner,
        )
      ).statusCode,
    ).toBe(200);
    expect((await request('GET', detail, member.user)).statusCode).toBe(404);
  });
  it('serializes concurrent team administrator removals and preserves a usable administrator', async () => {
    const { owner, workspaceId, path } = await fixture();
    const second = await join(workspaceId);
    const created = await team(path, owner, undefined, 'PRIVATE');
    const detail = `${path}/${created.id}`;
    expect(
      (
        await request('POST', `${detail}/members`, owner, {
          membershipId: second.membershipId,
          role: 'ADMIN',
        })
      ).statusCode,
    ).toBe(201);
    const ownerMembership = (
      await database.connection.query<{ id: string }>(
        'SELECT id FROM memberships WHERE workspace_id=$1 AND user_id=$2',
        [workspaceId, owner.user.id],
      )
    ).rows[0]!.id;
    const results = await Promise.all([
      request('PATCH', `${detail}/members/${ownerMembership}`, owner, {
        role: 'MEMBER',
      }),
      request('PATCH', `${detail}/members/${second.membershipId}`, owner, {
        role: 'MEMBER',
      }),
    ]);
    expect(results.map((item) => item.statusCode).sort()).toEqual([200, 409]);
    const admins = await database.connection.query(
      "SELECT id FROM team_memberships WHERE team_id=$1 AND role='ADMIN'",
      [created.id],
    );
    expect(admins.rows).toHaveLength(1);
  });
  it('denies cross-workspace reads and stale private-team command replay', async () => {
    const { owner, workspaceId, path } = await fixture();
    const admin = await join(workspaceId);
    const outsider = await fixture();
    const created = await team(path, owner, undefined, 'PRIVATE');
    const detail = `${path}/${created.id}`;
    expect(
      (
        await request('POST', `${detail}/members`, owner, {
          membershipId: admin.membershipId,
          role: 'ADMIN',
        })
      ).statusCode,
    ).toBe(201);
    for (const suffix of ['', '/statuses', '/settings', '/members']) {
      expect(
        (await request('GET', `${detail}${suffix}`, outsider.owner)).statusCode,
      ).toBe(404);
    }
    const key = randomUUID();
    const body = { name: 'Team admin edit' };
    expect(
      (await request('PATCH', detail, admin.user, body, key)).statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          'PATCH',
          `${detail}/members/${admin.membershipId}`,
          owner,
          { role: 'MEMBER' },
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await request('PATCH', detail, admin.user, body, key)).statusCode,
    ).toBe(403);
    await database.connection.query(
      "UPDATE memberships SET state='SUSPENDED' WHERE id=$1",
      [admin.membershipId],
    );
    expect((await request('GET', detail, admin.user)).statusCode).toBe(404);
  });
  it('validates cycle settings and denies product writes by guests', async () => {
    const { owner, workspaceId, path } = await fixture();
    const guest = await join(workspaceId, 'GUEST');
    const created = await team(path, owner);
    const settings = `${path}/${created.id}/settings`;
    for (const payload of [
      { timezone: 'Mars/Olympus' },
      { cycleStartDay: 7 },
      { cycleDurationWeeks: 0 },
      { cycleCooldownDays: -1 },
      { upcomingCyclesCount: 1000 },
    ]) {
      expect(
        (await request('PATCH', settings, owner, payload)).statusCode,
      ).toBe(400);
    }
    const payload = {
      timezone: 'Asia/Phnom_Penh',
      cycleStartDay: 1,
      cycleDurationWeeks: 2,
      cycleCooldownDays: 1,
      upcomingCyclesCount: 3,
      cyclesEnabled: true,
    };
    expect((await request('PATCH', settings, owner, payload)).statusCode).toBe(
      200,
    );
    expect(
      (await request('GET', settings, owner)).json<{ data: unknown }>().data,
    ).toMatchObject(payload);
    expect(
      (await request('PATCH', settings, guest.user, payload)).statusCode,
    ).toBe(404);
  });
  it('serializes concurrent default changes and enforces usable default categories', async () => {
    const { owner, path } = await fixture();
    const created = await team(path, owner);
    const detail = `${path}/${created.id}`;
    const first = await status(detail, owner, 'Working');
    const second = await status(detail, owner, 'Review');
    const results = await Promise.all([
      request('POST', `${detail}/statuses/${first.id}/default`, owner),
      request('POST', `${detail}/statuses/${second.id}/default`, owner),
    ]);
    expect(results.map((item) => item.statusCode)).toEqual([201, 201]);
    const activeDefault = await defaults(created.id);
    expect(activeDefault).toHaveLength(1);
    expect(
      (
        await request(
          'PATCH',
          `${detail}/statuses/${activeDefault[0]!.id}`,
          owner,
          {
            category: 'COMPLETED',
          },
        )
      ).statusCode,
    ).toBe(409);
    const terminal = await request('POST', `${detail}/statuses`, owner, {
      name: 'Completed custom',
      category: 'COMPLETED',
    });
    expect(terminal.statusCode).toBe(201);
    expect(
      (
        await request(
          'POST',
          `${detail}/statuses/${terminal.json<{ data: Resource }>().data.id}/default`,
          owner,
        )
      ).statusCode,
    ).toBe(409);
  });
  it('requires same-team replacement when retiring an in-use status and preserves default', async () => {
    const { owner, workspaceId, path } = await fixture();
    const created = await team(path, owner);
    const detail = `${path}/${created.id}`;
    const initial = (await defaults(created.id))[0]!;
    const replacement = await status(detail, owner, 'Replacement');
    const otherTeam = await team(path, owner);
    const foreignStatus = (await defaults(otherTeam.id))[0]!;
    const issueId = randomUUID();
    await database.connection.query(
      'INSERT INTO issues(id,workspace_id,team_id,number,identifier,title,status_id) VALUES($1,$2,$3,1,$4,$5,$6)',
      [
        issueId,
        workspaceId,
        created.id,
        `${created.key}-1`,
        'Status dependency',
        initial.id,
      ],
    );
    expect(
      (await request('DELETE', `${detail}/statuses/${initial.id}`, owner))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await request('DELETE', `${detail}/statuses/${initial.id}`, owner, {
          replacementStatusId: foreignStatus.id,
        })
      ).statusCode,
    ).toBe(404);
    expect((await request('DELETE', detail, owner)).statusCode).toBe(409);
    expect(
      (
        await request('DELETE', `${detail}/statuses/${initial.id}`, owner, {
          replacementStatusId: replacement.id,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await database.connection.query<{ status_id: string }>(
          'SELECT status_id FROM issues WHERE id=$1',
          [issueId],
        )
      ).rows[0]!.status_id,
    ).toBe(replacement.id);
    expect(await defaults(created.id)).toEqual([{ id: replacement.id }]);
    const facts = await database.connection.query(
      'SELECT event_type,payload FROM events WHERE aggregate_type=$1 AND aggregate_id=$2',
      ['issue', issueId],
    );
    expect(facts.rows).toEqual([
      {
        event_type: 'issue.status_changed',
        payload: {
          issue_id: issueId,
          previous_status_id: initial.id,
          status_id: replacement.id,
        },
      },
    ]);
  });
  it('reorders full status catalogs atomically without accepting duplicates or foreign IDs', async () => {
    const { owner, path } = await fixture();
    const created = await team(path, owner);
    const detail = `${path}/${created.id}`;
    await status(detail, owner, 'Working');
    await status(detail, owner, 'Review');
    const catalog = (await request('GET', `${detail}/statuses`, owner)).json<{
      data: Resource[];
    }>().data;
    const ids = catalog.map((item) => item.id);
    expect(
      (
        await request('POST', `${detail}/statuses/reorder`, owner, {
          statusIds: [ids[0], ids[0]],
        })
      ).statusCode,
    ).toBe(400);
    const results = await Promise.all([
      request('POST', `${detail}/statuses/reorder`, owner, {
        statusIds: ids.toReversed(),
      }),
      request('POST', `${detail}/statuses/reorder`, owner, { statusIds: ids }),
    ]);
    expect(results.map((item) => item.statusCode)).toEqual([201, 201]);
    const ordered = (await request('GET', `${detail}/statuses`, owner)).json<{
      data: Resource[];
    }>().data;
    expect(new Set(ordered.map((item) => item.position)).size).toBe(ids.length);
    expect(ordered.map((item) => item.id).sort()).toEqual(ids.sort());
    expect(await defaults(created.id)).toHaveLength(1);
  });
  it('allocates monotonic unique issue numbers in caller transactions and rolls back failed reservations', async () => {
    const { owner, workspaceId, path } = await fixture();
    const created = await team(path, owner, 'COUNTER');
    const allocator = app.get(TeamIssueNumberAllocator);
    const db = app.get(DatabaseService).db;
    const numbers = await Promise.all(
      Array.from({ length: 12 }, () =>
        db.transaction((tx) =>
          allocator.allocate(tx, owner.user.id, workspaceId, created.id),
        ),
      ),
    );
    expect(numbers.map((item) => item.number).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    expect(new Set(numbers.map((item) => item.identifier)).size).toBe(12);
    expect(
      numbers.every((item) => item.identifier === `COUNTER-${item.number}`),
    ).toBe(true);
    await expect(
      db.transaction(async (tx) => {
        await allocator.allocate(tx, owner.user.id, workspaceId, created.id);
        throw new Error('Abort number reservation');
      }),
    ).rejects.toThrow('Abort number reservation');
    expect(
      (
        await db.transaction((tx) =>
          allocator.allocate(tx, owner.user.id, workspaceId, created.id),
        )
      ).number,
    ).toBe(13);
    await expect(
      database.connection.query(
        'UPDATE teams SET next_issue_number=1 WHERE id=$1',
        [created.id],
      ),
    ).rejects.toBeDefined();
    expect(
      (await request('DELETE', `${path}/${created.id}`, owner)).statusCode,
    ).toBe(200);
    await expect(
      db.transaction((tx) =>
        allocator.allocate(tx, owner.user.id, workspaceId, created.id),
      ),
    ).rejects.toThrow('retired');
  });
  it('rolls back team, key reservation and command receipt when event append fails', async () => {
    const { owner, workspaceId, path } = await fixture();
    const key = randomUUID();
    const writer = app.get(EventWriter);
    const failure = jest
      .spyOn(writer, 'append')
      .mockRejectedValueOnce(new Error('Injected event failure'));
    try {
      expect(
        (
          await request(
            'POST',
            path,
            owner,
            { name: 'Rollback', key: 'ROLLBACK' },
            key,
          )
        ).statusCode,
      ).toBe(500);
    } finally {
      failure.mockRestore();
    }
    expect(
      (
        await database.connection.query(
          'SELECT id FROM idempotency_keys WHERE key=$1',
          [key],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await database.connection.query(
          "SELECT id FROM events WHERE workspace_id=$1 AND event_type='team.created'",
          [workspaceId],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await database.connection.query(
          'SELECT id FROM teams WHERE workspace_id=$1 AND key=$2',
          [workspaceId, 'ROLLBACK'],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await request(
          'POST',
          path,
          owner,
          { name: 'Retry', key: 'ROLLBACK' },
          key,
        )
      ).statusCode,
    ).toBe(201);
  });
});
