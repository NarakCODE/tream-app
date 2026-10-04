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
import { prepareIntegrationDatabase } from './helpers/integration-environment';
type User = { accessToken: string; user: { id: string } };
type Entity = {
  id: string;
  revision: number;
  body: string | null;
  teamId: string;
  identifier: string;
  name: string;
  defaults: Record<string, unknown>;
};
type Fixture = {
  owner: User;
  w: string;
  team: Entity;
  issue: Entity;
  base: string;
};
describe('M09 collaboration PostgreSQL HTTP contracts', () => {
  let app: NestFastifyApplication;
  let database: Awaited<ReturnType<typeof prepareIntegrationDatabase>>;
  let number = 0;
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
      remoteAddress: `10.79.${Math.floor(++number / 250)}.${(number % 250) + 1}`,
      ...(payload ? { payload } : {}),
    });
  }
  async function signup() {
    const email = `collab-${randomUUID()}@example.test`;
    const r = await request('POST', '/auth/signup', undefined, {
      email,
      password: 'Integration-password-2026',
      fullName: 'Collaboration tester',
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
  async function create(path: string, user: User, payload: object) {
    const r = await request('POST', path, user, payload);
    if (r.statusCode !== 201)
      throw new Error(`${path}: ${r.statusCode} ${r.body}`);
    return r.json<{ data: Entity }>().data;
  }
  async function fixture(): Promise<Fixture> {
    const owner = await signup();
    const workspace = await create('/workspaces', owner, {
      name: 'Collaboration',
      slug: `collab-${randomUUID()}`,
    });
    const base = `/workspaces/${workspace.id}`;
    const team = await create(`${base}/teams`, owner, {
      name: 'Team',
      key: `C${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    });
    const issue = await create(`${base}/issues`, owner, {
      teamId: team.id,
      title: 'Collaborate',
    });
    return { owner, w: workspace.id, team, issue, base };
  }
  async function join(f: Fixture, role = 'MEMBER') {
    const user = await signup();
    const id = randomUUID();
    await database.connection.query(
      'INSERT INTO memberships(id,workspace_id,user_id,role) VALUES ($1,$2,$3,$4)',
      [id, f.w, user.user.id, role],
    );
    return { user, id };
  }
  async function comment(f: Fixture, user = f.owner, extra = {}) {
    return create(`${f.base}/comments`, user, {
      targetType: 'issue',
      targetId: f.issue.id,
      body: 'Original content',
      ...extra,
    });
  }
  it('author edits enforce revision; concurrent edits yield exactly one winner', async () => {
    const f = await fixture();
    const c = await comment(f);
    const responses = await Promise.all(
      ['A', 'B'].map((body) =>
        request('PATCH', `${f.base}/comments/${c.id}`, f.owner, {
          body,
          expectedRevision: 1,
        }),
      ),
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const row = await database.connection.query<{ revision: number }>(
      'SELECT revision FROM comments WHERE id=$1',
      [c.id],
    );
    expect(row.rows[0]!.revision).toBe(2);
  });
  it('author attribution persists after membership departure and content cannot be overwritten by owner', async () => {
    const f = await fixture();
    const member = await join(f);
    const c = await comment(f, member.user);
    expect(
      (
        await request('PATCH', `${f.base}/comments/${c.id}`, f.owner, {
          body: 'Overwrite',
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(403);
    await database.connection.query(
      "UPDATE memberships SET state='LEFT' WHERE id=$1",
      [member.id],
    );
    expect(
      (
        await request('PATCH', `${f.base}/comments/${c.id}`, member.user, {
          body: 'Removed author',
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(404);
    const r = await request('DELETE', `${f.base}/comments/${c.id}`, f.owner, {
      expectedRevision: 1,
    });
    expect(r.statusCode).toBe(200);
    const read = await request('GET', `${f.base}/comments/${c.id}`, f.owner);
    expect(read.json<{ data: Entity }>().data.body).toBeNull();
    expect(
      (
        await request('POST', `${f.base}/comments/${c.id}/restore`, f.owner, {
          expectedRevision: 2,
        })
      ).statusCode,
    ).toBe(201);
    const rows = await database.connection.query<{ author_id: string }>(
      'SELECT author_id FROM comments WHERE id=$1',
      [c.id],
    );
    expect(rows.rows[0]!.author_id).toBe(member.id);
  });
  it('replies require the exact inherited target; parent target/author fields cannot be patched', async () => {
    const f = await fixture();
    const c = await comment(f);
    const other = await create(`${f.base}/issues`, f.owner, {
      teamId: f.team.id,
      title: 'Other',
    });
    expect(
      (
        await request('POST', `${f.base}/comments`, f.owner, {
          targetType: 'issue',
          targetId: other.id,
          parentCommentId: c.id,
          body: 'Wrong target',
        })
      ).statusCode,
    ).toBe(400);
    const reply = await comment(f, f.owner, { parentCommentId: c.id });
    expect(
      (
        await request('PATCH', `${f.base}/comments/${reply.id}`, f.owner, {
          body: 'Cycle',
          expectedRevision: 1,
          parentCommentId: reply.id,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request('DELETE', `${f.base}/comments/${c.id}`, f.owner, {
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request('DELETE', `${f.base}/comments/${reply.id}`, f.owner, {
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(200);
  });
  it('private resources and cross-tenant replies are hidden', async () => {
    const f = await fixture();
    const privateTeam = await create(`${f.base}/teams`, f.owner, {
      name: 'Private',
      key: `P${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
      visibility: 'PRIVATE',
    });
    const privateIssue = await create(`${f.base}/issues`, f.owner, {
      teamId: privateTeam.id,
      title: 'Secret',
    });
    const c = await comment(f, f.owner, { targetId: privateIssue.id });
    const member = await join(f);
    expect(
      (await request('GET', `${f.base}/comments/${c.id}`, member.user))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await request('POST', `${f.base}/comments`, member.user, {
          targetType: 'issue',
          targetId: privateIssue.id,
          body: 'Secret write',
        })
      ).statusCode,
    ).toBe(404);
    const foreign = await fixture();
    expect(
      (
        await request('POST', `${foreign.base}/comments`, foreign.owner, {
          targetType: 'issue',
          targetId: foreign.issue.id,
          parentCommentId: c.id,
          body: 'Foreign reply',
        })
      ).statusCode,
    ).toBe(404);
  });
  it('guests cannot comment, react, subscribe or assign labels even with explicit team access', async () => {
    const f = await fixture();
    const guest = await join(f, 'GUEST');
    await database.connection.query(
      "INSERT INTO team_memberships(id,workspace_id,team_id,membership_id,role) VALUES($1,$2,$3,$4,'MEMBER')",
      [randomUUID(), f.w, f.team.id, guest.id],
    );
    const c = await comment(f);
    for (const [path, body] of [
      [
        `${f.base}/comments`,
        { targetType: 'issue', targetId: f.issue.id, body: 'Guest' },
      ],
      [`${f.base}/comments/${c.id}/reactions`, { emoji: '👍' }],
      [`${f.base}/issues/${f.issue.id}/subscription`, {}],
    ] as const)
      expect((await request('POST', path, guest.user, body)).statusCode).toBe(
        403,
      );
  });
  it('duplicate reactions race safely and retry replays once', async () => {
    const f = await fixture();
    const c = await comment(f);
    const path = `${f.base}/comments/${c.id}/reactions`;
    const key = randomUUID();
    const r = await request('POST', path, f.owner, { emoji: '👍' }, key);
    expect(r.statusCode).toBe(201);
    expect(
      (await request('POST', path, f.owner, { emoji: '👍' }, key)).statusCode,
    ).toBe(201);
    expect(
      (await request('POST', path, f.owner, { emoji: '👍' })).statusCode,
    ).toBe(409);
    const race = await Promise.all(
      [1, 2].map(() => request('POST', path, f.owner, { emoji: '❤️' })),
    );
    expect(race.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(
      (await request('DELETE', path, f.owner, { emoji: '👍' })).statusCode,
    ).toBe(200);
  });
  it('subscriptions are self-owned and duplicate concurrent subscribe conflicts', async () => {
    const f = await fixture();
    const path = `${f.base}/issues/${f.issue.id}/subscription`;
    const race = await Promise.all(
      [1, 2].map(() => request('POST', path, f.owner)),
    );
    expect(race.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const list = await request(
      'GET',
      `${f.base}/issues/${f.issue.id}/subscribers`,
      f.owner,
    );
    expect(list.json<{ data: unknown[] }>().data).toHaveLength(1);
    expect((await request('DELETE', path, f.owner)).statusCode).toBe(200);
    expect((await request('DELETE', path, f.owner)).statusCode).toBe(404);
  });
  it('label names normalize per scope; ordinary members cannot manage workspace labels', async () => {
    const f = await fixture();
    await create(`${f.base}/labels`, f.owner, {
      name: ' Bug ',
      color: '#ff0000',
    });
    expect(
      (
        await request('POST', `${f.base}/labels`, f.owner, {
          name: 'bug',
          color: '#ff0000',
        })
      ).statusCode,
    ).toBe(409);
    await create(`${f.base}/labels`, f.owner, {
      name: 'bug',
      color: '#ff0000',
      teamId: f.team.id,
    });
    const member = await join(f);
    expect(
      (
        await request('POST', `${f.base}/labels`, member.user, {
          name: 'No',
          color: '#ff0000',
        })
      ).statusCode,
    ).toBe(403);
  });
  it('issue labels require a current issue revision and scope edits cannot break assignments', async () => {
    const f = await fixture();
    const label = await create(`${f.base}/labels`, f.owner, {
      name: 'Team label',
      color: '#ff0000',
      teamId: f.team.id,
    });
    const path = `${f.base}/issues/${f.issue.id}/labels`;
    expect(
      (await request('POST', path, f.owner, { labelId: label.id })).statusCode,
    ).toBe(409);
    const linked = await request('POST', path, f.owner, {
      labelId: label.id,
      expectedRevision: 1,
    });
    expect(linked.statusCode).toBe(201);
    expect(linked.json<{ data: Entity }>().data.revision).toBe(2);
    expect(
      (
        await request('PATCH', `${f.base}/labels/${label.id}`, f.owner, {
          teamId: null,
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request('DELETE', `${path}/${label.id}`, f.owner, {
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request('DELETE', `${path}/${label.id}`, f.owner, {
          expectedRevision: 2,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request('PATCH', `${f.base}/labels/${label.id}`, f.owner, {
          teamId: null,
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(200);
  });
  it('transfer atomically removes incompatible team labels and keeps workspace labels', async () => {
    const f = await fixture();
    const team = await create(`${f.base}/teams`, f.owner, {
      name: 'Destination',
      key: `D${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    });
    const scoped = await create(`${f.base}/labels`, f.owner, {
      name: 'Scoped',
      color: '#ff0000',
      teamId: f.team.id,
    });
    const global = await create(`${f.base}/labels`, f.owner, {
      name: 'Global',
      color: '#00ff00',
    });
    for (const [labelId, expectedRevision] of [
      [scoped.id, 1],
      [global.id, 2],
    ] as const)
      expect(
        (
          await request(
            'POST',
            `${f.base}/issues/${f.issue.id}/labels`,
            f.owner,
            { labelId, expectedRevision },
          )
        ).statusCode,
      ).toBe(201);
    const r = await request(
      'POST',
      `${f.base}/issues/${f.issue.id}/transfer`,
      f.owner,
      { teamId: team.id, expectedRevision: 3 },
    );
    expect(r.statusCode).toBe(200);
    const rows = await database.connection.query<{ label_id: string }>(
      'SELECT label_id FROM issue_labels WHERE issue_id=$1',
      [f.issue.id],
    );
    expect(rows.rows.map((x) => x.label_id)).toEqual([global.id]);
  });
  it('project labels are workspace scoped and project subscriptions/comments use project visibility', async () => {
    const f = await fixture();
    const project = await create(`${f.base}/projects`, f.owner, {
      name: 'Planning',
      teamIds: [f.team.id],
    });
    const scoped = await create(`${f.base}/labels`, f.owner, {
      name: 'Scoped',
      color: '#ff0000',
      teamId: f.team.id,
    });
    const global = await create(`${f.base}/labels`, f.owner, {
      name: 'Global',
      color: '#00ff00',
    });
    expect(
      (
        await request(
          'POST',
          `${f.base}/projects/${project.id}/labels`,
          f.owner,
          { labelId: scoped.id },
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request(
          'POST',
          `${f.base}/projects/${project.id}/labels`,
          f.owner,
          { labelId: global.id },
        )
      ).statusCode,
    ).toBe(201);
    await create(`${f.base}/comments`, f.owner, {
      targetType: 'project',
      targetId: project.id,
      body: 'Planning comment',
    });
    expect(
      (
        await request(
          'POST',
          `${f.base}/projects/${project.id}/subscription`,
          f.owner,
        )
      ).statusCode,
    ).toBe(201);
    const update = await create(
      `${f.base}/projects/${project.id}/updates`,
      f.owner,
      { body: 'Progress update', health: 'ON_TRACK' },
    );
    await create(`${f.base}/comments`, f.owner, {
      targetType: 'project_update',
      targetId: update.id,
      body: 'Update comment',
    });
  });
  it('templates reject foreign/private defaults and arbitrary JSON; instantiate is one atomic replayable command', async () => {
    const f = await fixture();
    const foreign = await fixture();
    expect(
      (
        await request('POST', `${f.base}/issue-templates`, f.owner, {
          name: 'Foreign',
          teamId: f.team.id,
          defaults: { cycleId: foreign.issue.id },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request('POST', `${f.base}/issue-templates`, f.owner, {
          name: 'Executable',
          defaults: { sql: 'DROP TABLE' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request('POST', `${f.base}/issue-templates`, f.owner, {
          name: 'Wrong scope',
          defaults: { teamId: f.team.id },
        })
      ).statusCode,
    ).toBe(400);
    const label = await create(`${f.base}/labels`, f.owner, {
      name: 'Template label',
      color: '#ff0000',
      teamId: f.team.id,
    });
    const template = await create(`${f.base}/issue-templates`, f.owner, {
      name: 'Bug',
      teamId: f.team.id,
      titleTemplate: 'Bug report',
      defaults: { priority: 'HIGH', labelIds: [label.id] },
    });
    const key = randomUUID();
    const path = `${f.base}/issue-templates/${template.id}/instantiate`;
    const r = await request('POST', path, f.owner, { teamId: f.team.id }, key);
    expect(r.statusCode).toBe(201);
    expect(
      (await request('POST', path, f.owner, { teamId: f.team.id }, key)).json<{
        data: Entity;
      }>().data.id,
    ).toBe(r.json<{ data: Entity }>().data.id);
    const rows = await database.connection.query(
      'SELECT * FROM issue_labels WHERE issue_id=$1',
      [r.json<{ data: Entity }>().data.id],
    );
    expect(rows.rowCount).toBe(1);
  });
  it('activity and event facts omit content and hidden relation identifiers, with stable pagination', async () => {
    const f = await fixture();
    await comment(f);
    const c = await comment(f);
    await request('PATCH', `${f.base}/comments/${c.id}`, f.owner, {
      body: 'SECRET',
      expectedRevision: 1,
    });
    const r = await request(
      'GET',
      `${f.base}/issues/${f.issue.id}/activity?limit=1`,
      f.owner,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toContain('SECRET');
    const data = r.json<{
      data: Entity[];
      meta: { nextCursor: string; total: number };
    }>();
    expect(data.data).toHaveLength(1);
    expect(data.meta.total).toBeGreaterThanOrEqual(4);
    expect(data.data[0]).toHaveProperty('action', 'comment.updated');
    const facts = await database.connection.query<{
      payload: object;
      schema_version: number;
    }>(
      'SELECT payload,schema_version FROM events WHERE aggregate_id=$1 AND event_type=$2',
      [c.id, 'comment.updated'],
    );
    expect(facts.rows[0]!.schema_version).toBe(2);
    expect(JSON.stringify(facts.rows[0]!.payload)).not.toContain('SECRET');
  });
  it('template lists and totals omit defaults that become private to the viewer', async () => {
    const f = await fixture();
    const member = await join(f);
    const project = await create(`${f.base}/projects`, f.owner, {
      name: 'Shared plan',
      teamIds: [f.team.id],
    });
    const template = await create(`${f.base}/issue-templates`, f.owner, {
      name: 'Plan template',
      teamId: f.team.id,
      defaults: { projectId: project.id },
    });
    const before = await request(
      'GET',
      `${f.base}/issue-templates`,
      member.user,
    );
    expect(before.json<{ meta: { total: number } }>().meta.total).toBe(1);
    expect(before.body).not.toContain(project.id);
    const privateTeam = await create(`${f.base}/teams`, f.owner, {
      name: 'Private plan',
      key: `X${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
      visibility: 'PRIVATE',
    });
    expect(
      (
        await request(
          'POST',
          `${f.base}/projects/${project.id}/teams`,
          f.owner,
          { teamId: privateTeam.id },
        )
      ).statusCode,
    ).toBe(201);
    const after = await request(
      'GET',
      `${f.base}/issue-templates`,
      member.user,
    );
    expect(after.json<{ meta: { total: number } }>().meta.total).toBe(0);
    expect(after.body).not.toContain(template.id);
    expect(
      (
        await request(
          'GET',
          `${f.base}/issue-templates/${template.id}`,
          member.user,
        )
      ).statusCode,
    ).toBe(404);
  });
  it('label assignment versus transfer race preserves scope and issue revision', async () => {
    const f = await fixture();
    const dest = await create(`${f.base}/teams`, f.owner, {
      name: 'Race destination',
      key: `R${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    });
    const label = await create(`${f.base}/labels`, f.owner, {
      name: 'Scoped race',
      color: '#ff0000',
      teamId: f.team.id,
    });
    const outcomes = await Promise.all([
      request('POST', `${f.base}/issues/${f.issue.id}/labels`, f.owner, {
        labelId: label.id,
        expectedRevision: 1,
      }),
      request('POST', `${f.base}/issues/${f.issue.id}/transfer`, f.owner, {
        teamId: dest.id,
        expectedRevision: 1,
      }),
    ]);
    expect(outcomes.filter((r) => r.statusCode < 300)).toHaveLength(1);
    expect(outcomes.filter((r) => r.statusCode === 409)).toHaveLength(1);
    const invalid = await database.connection.query(
      'SELECT il.id FROM issue_labels il JOIN labels l ON l.id=il.label_id JOIN issues i ON i.id=il.issue_id WHERE i.id=$1 AND l.team_id IS NOT NULL AND l.team_id<>i.team_id',
      [f.issue.id],
    );
    expect(invalid.rowCount).toBe(0);
  });
  it('subscription lists omit members who lost resource visibility and retries reauthorize', async () => {
    const f = await fixture();
    const member = await join(f);
    const path = `${f.base}/issues/${f.issue.id}/subscription`;
    const key = randomUUID();
    expect(
      (await request('POST', path, member.user, undefined, key)).statusCode,
    ).toBe(201);
    expect(
      (
        await request('PATCH', `${f.base}/teams/${f.team.id}`, f.owner, {
          visibility: 'PRIVATE',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request('POST', path, member.user, undefined, key)).statusCode,
    ).toBe(404);
    const list = await request(
      'GET',
      `${f.base}/issues/${f.issue.id}/subscribers`,
      f.owner,
    );
    expect(list.json<{ meta: { total: number } }>().meta.total).toBe(0);
  });
  it('subscriber counts inherit private project and ancestor visibility', async () => {
    const f = await fixture();
    const member = await join(f);
    const project = await create(`${f.base}/projects`, f.owner, {
      name: 'Linked project',
      teamIds: [f.team.id],
    });
    expect(
      (
        await request('PATCH', `${f.base}/issues/${f.issue.id}`, f.owner, {
          projectId: project.id,
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          'POST',
          `${f.base}/issues/${f.issue.id}/subscription`,
          member.user,
        )
      ).statusCode,
    ).toBe(201);
    const privateTeam = await create(`${f.base}/teams`, f.owner, {
      name: 'Private subscriber dependency',
      key: `S${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
      visibility: 'PRIVATE',
    });
    expect(
      (
        await request(
          'POST',
          `${f.base}/projects/${project.id}/teams`,
          f.owner,
          { teamId: privateTeam.id },
        )
      ).statusCode,
    ).toBe(201);
    const list = await request(
      'GET',
      `${f.base}/issues/${f.issue.id}/subscribers`,
      f.owner,
    );
    expect(list.json<{ meta: { total: number } }>().meta.total).toBe(0);
    expect(
      (
        await request('PATCH', `${f.base}/issues/${f.issue.id}`, f.owner, {
          projectId: null,
          expectedRevision: 2,
        })
      ).statusCode,
    ).toBe(200);
    const parent = await create(`${f.base}/issues`, f.owner, {
      teamId: privateTeam.id,
      title: 'Private parent',
    });
    expect(
      (
        await request('PATCH', `${f.base}/issues/${f.issue.id}`, f.owner, {
          parentId: parent.id,
          expectedRevision: 3,
        })
      ).statusCode,
    ).toBe(200);
    const hiddenAncestor = await request(
      'GET',
      `${f.base}/issues/${f.issue.id}/subscribers`,
      f.owner,
    );
    expect(hiddenAncestor.json<{ meta: { total: number } }>().meta.total).toBe(
      0,
    );
  });
});
