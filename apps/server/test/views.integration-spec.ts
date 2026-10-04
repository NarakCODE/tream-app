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
type Created = { id: string; revision: number };
describe('M12 permission-filtered saved views, favorites and search', () => {
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
      remoteAddress: `10.92.${Math.floor(++number / 250)}.${(number % 250) + 1}`,
      ...(payload ? { payload } : {}),
    });
  }
  async function signup(): Promise<User> {
    const email = `views-${randomUUID()}@example.test`;
    const r = await request('POST', '/auth/signup', undefined, {
      email,
      password: 'Integration-password-2026',
      fullName: 'View tester',
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
  async function fixture() {
    const owner = await signup();
    const r = await request('POST', '/workspaces', owner, {
      name: 'Views workspace',
      slug: `views-${randomUUID()}`,
    });
    expect(r.statusCode).toBe(201);
    const w = r.json<{ data: Created }>().data.id;
    const team = await createTeam(w, owner);
    return { owner, w, teamId: team.id, path: `/workspaces/${w}` };
  }
  async function createTeam(w: string, owner: User, visibility = 'WORKSPACE') {
    const r = await request('POST', `/workspaces/${w}/teams`, owner, {
      name: 'Search team',
      key: `V${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
      visibility,
    });
    expect(r.statusCode).toBe(201);
    return r.json<{ data: Created }>().data;
  }
  async function join(w: string, role = 'MEMBER') {
    const user = await signup();
    const id = randomUUID();
    await database.connection.query(
      'INSERT INTO memberships(id,workspace_id,user_id,role) VALUES($1,$2,$3,$4)',
      [id, w, user.user.id, role],
    );
    return { user, id };
  }
  async function issue(
    w: string,
    teamId: string,
    owner: User,
    title = 'needle issue',
    extra: object = {},
  ) {
    const r = await request('POST', `/workspaces/${w}/issues`, owner, {
      teamId,
      title,
      ...extra,
    });
    expect(r.statusCode).toBe(201);
    return r.json<{ data: Created }>().data;
  }
  async function view(path: string, owner: User, extra: object = {}) {
    const r = await request('POST', `${path}/views`, owner, {
      name: 'View',
      resource: 'ISSUES',
      filters: { version: 1 },
      ...extra,
    });
    if (r.statusCode !== 201) throw new Error(r.body);
    return r.json<{ data: Created }>().data;
  }
  it('mounts authenticated routes and separates private/shared administration', async () => {
    const f = await fixture();
    const reader = await join(f.w);
    const admin = await join(f.w, 'ADMIN');
    expect((await request('GET', `${f.path}/views`)).statusCode).toBe(401);
    const privateView = await view(f.path, f.owner);
    expect(
      (await request('GET', `${f.path}/views/${privateView.id}`, reader.user))
        .statusCode,
    ).toBe(404);
    expect(
      (await request('GET', `${f.path}/views/${privateView.id}`, admin.user))
        .statusCode,
    ).toBe(404);
    const shared = await view(f.path, f.owner, { visibility: 'WORKSPACE' });
    expect(
      (await request('GET', `${f.path}/views/${shared.id}`, reader.user))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await request('PATCH', `${f.path}/views/${shared.id}`, reader.user, {
          expectedRevision: 1,
          name: 'Denied',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request('PATCH', `${f.path}/views/${shared.id}`, admin.user, {
          expectedRevision: 1,
          name: 'Admin managed',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request('PATCH', `${f.path}/views/${shared.id}`, f.owner, {
          expectedRevision: 1,
          name: 'Stale',
        })
      ).statusCode,
    ).toBe(409);
  });
  it('validates allowlisted filter grammar and referenced tenant/team/status scopes', async () => {
    const f = await fixture();
    const other = await fixture();
    const hidden = await createTeam(f.w, f.owner, 'PRIVATE');
    const reader = await join(f.w);
    for (const filters of [
      { version: 2 },
      { version: 1, where: 'SELECT secret' },
      { version: 1, sort: 'random()' },
      { version: 1, text: 'x'.repeat(101) },
      { version: 1, teamId: [] },
      { version: 1, statusCategory: 'ACTIVE' },
    ])
      expect(
        (
          await request('POST', `${f.path}/views`, f.owner, {
            name: 'Unsafe',
            resource: 'ISSUES',
            filters,
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (
        await request('POST', `${f.path}/views`, reader.user, {
          name: 'Hidden',
          resource: 'ISSUES',
          filters: { version: 1, teamId: hidden.id },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request('POST', `${f.path}/views/query`, f.owner, {
          resource: 'ISSUES',
          filters: { version: 1, teamId: other.teamId },
        })
      ).statusCode,
    ).toBe(404);
    const statuses = await database.connection.query<{ id: string }>(
      'SELECT id FROM issue_statuses WHERE team_id=$1 LIMIT 1',
      [hidden.id],
    );
    expect(
      (
        await request('POST', `${f.path}/views/query`, f.owner, {
          resource: 'ISSUES',
          filters: {
            version: 1,
            teamId: f.teamId,
            statusId: statuses.rows[0]!.id,
          },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('filters private project and ancestor scopes before results and totals', async () => {
    const f = await fixture();
    const reader = await join(f.w);
    const hidden = await createTeam(f.w, f.owner, 'PRIVATE');
    await issue(f.w, f.teamId, f.owner);
    await issue(f.w, hidden.id, f.owner, 'needle private');
    const project = await request('POST', `${f.path}/projects`, f.owner, {
      name: 'needle private project',
      teamIds: [f.teamId, hidden.id],
    });
    expect(project.statusCode).toBe(201);
    await issue(f.w, f.teamId, f.owner, 'needle hiddenproject', {
      projectId: project.json<{ data: Created }>().data.id,
    });
    const parent = await issue(f.w, hidden.id, f.owner, 'hidden ancestor');
    await issue(f.w, f.teamId, f.owner, 'needle hiddenchild', {
      parentId: parent.id,
    });
    const response = await request(
      'GET',
      `${f.path}/search?q=needle`,
      reader.user,
    );
    if (response.statusCode !== 200) throw new Error(response.body);
    const result = response.json<{
      data: { title: string }[];
      meta: { total: number };
    }>();
    expect(result.meta.total).toBe(1);
    expect(result.data.map((row) => row.title)).toEqual(['needle issue']);
    const query = await request('POST', `${f.path}/views/query`, reader.user, {
      resource: 'ISSUES',
      filters: { version: 1, text: 'needle' },
    });
    expect(query.statusCode).toBe(200);
    expect(query.json<{ meta: { total: number } }>().meta.total).toBe(1);
  });
  it('queries all fixed sorts with literal wildcards and deterministic pagination ties', async () => {
    const f = await fixture();
    const a = await issue(f.w, f.teamId, f.owner, 'needle alpha');
    const b = await issue(f.w, f.teamId, f.owner, 'needle beta');
    await issue(f.w, f.teamId, f.owner, '100%_literal');
    await database.connection.query(
      "UPDATE issues SET created_at='2026-01-01T00:00:00.123456Z',updated_at='2026-01-02T00:00:00.123456Z' WHERE id=ANY($1::text[])",
      [[a.id, b.id]],
    );
    for (const sort of ['CREATED_DESC', 'UPDATED_DESC', 'TITLE_ASC']) {
      const first = await request('POST', `${f.path}/views/query`, f.owner, {
        resource: 'ISSUES',
        filters: { version: 1, text: 'needle', sort },
        limit: 1,
      });
      expect(first.statusCode).toBe(200);
      const body = first.json<{
        data: { id: string }[];
        meta: { total: number; nextCursor: string };
      }>();
      expect(body.meta.total).toBe(2);
      const second = await request('POST', `${f.path}/views/query`, f.owner, {
        resource: 'ISSUES',
        filters: { version: 1, text: 'needle', sort },
        limit: 1,
        cursor: body.meta.nextCursor,
      });
      if (second.statusCode !== 200)
        throw new Error(
          JSON.stringify({ sort, first: body, second: second.json<unknown>() }),
        );
      expect(second.statusCode).toBe(200);
      expect(
        new Set([
          body.data[0]!.id,
          second.json<{ data: { id: string }[] }>().data[0]!.id,
        ]),
      ).toEqual(new Set([a.id, b.id]));
      expect(
        (
          await request('POST', `${f.path}/views/query`, f.owner, {
            resource: 'ISSUES',
            filters: { version: 1, text: 'different', sort },
            cursor: body.meta.nextCursor,
          })
        ).statusCode,
      ).toBe(400);
    }
    const literal = await request(
      'GET',
      `${f.path}/search?q=${encodeURIComponent('%_')}`,
      f.owner,
    );
    expect(literal.statusCode).toBe(200);
    expect(literal.json<{ meta: { total: number } }>().meta.total).toBe(1);
  });
  it('omits archived parents and trashed resources from query/search', async () => {
    const f = await fixture();
    const parent = await issue(f.w, f.teamId, f.owner, 'Parent');
    await issue(f.w, f.teamId, f.owner, 'needle child', {
      parentId: parent.id,
    });
    const trash = await issue(f.w, f.teamId, f.owner);
    expect(
      (
        await request(
          'POST',
          `${f.path}/issues/${parent.id}/archive`,
          f.owner,
          { expectedRevision: 1 },
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request('DELETE', `${f.path}/issues/${trash.id}`, f.owner, {
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(200);
    const r = await request('GET', `${f.path}/search?q=needle`, f.owner);
    expect(r.statusCode).toBe(200);
    expect(r.json<{ meta: { total: number } }>().meta.total).toBe(0);
  });
  it('searches authorized documents and hides them from guests and inactive owners', async () => {
    const f = await fixture();
    const document = await request('POST', `${f.path}/documents`, f.owner, {
      ownerType: 'team',
      ownerId: f.teamId,
      title: 'needle document',
      body: 'needle body',
    });
    if (document.statusCode !== 201) throw new Error(document.body);
    const guest = await join(f.w, 'GUEST');
    expect(
      (
        await request('POST', `${f.path}/teams/${f.teamId}/members`, f.owner, {
          membershipId: guest.id,
          role: 'MEMBER',
        })
      ).statusCode,
    ).toBe(201);
    const owner = await request(
      'GET',
      `${f.path}/search?q=needle&resource=DOCUMENTS`,
      f.owner,
    );
    expect(owner.statusCode).toBe(200);
    expect(owner.json<{ meta: { total: number } }>().meta.total).toBe(1);
    const guestResult = await request(
      'GET',
      `${f.path}/search?q=needle&resource=DOCUMENTS`,
      guest.user,
    );
    expect(guestResult.statusCode).toBe(200);
    expect(guestResult.json<{ meta: { total: number } }>().meta.total).toBe(0);
    await database.connection.query(
      'UPDATE teams SET retired_at=now() WHERE id=$1',
      [f.teamId],
    );
    expect(
      (
        await request(
          'GET',
          `${f.path}/search?q=needle&resource=DOCUMENTS`,
          f.owner,
        )
      ).json<{ meta: { total: number } }>().meta.total,
    ).toBe(0);
  });
  it('makes favorites typed, deduplicated, revision checked and reorderable', async () => {
    const f = await fixture();
    const work = await issue(f.w, f.teamId, f.owner);
    const favorite = await request('POST', `${f.path}/favorites`, f.owner, {
      targetType: 'issue',
      targetId: work.id,
    });
    expect(favorite.statusCode).toBe(201);
    const a = favorite.json<{ data: Created }>().data;
    const duplicate = await request('POST', `${f.path}/favorites`, f.owner, {
      targetType: 'issue',
      targetId: work.id,
    });
    expect(duplicate.statusCode).toBe(201);
    expect(duplicate.json<{ data: Created }>().data.id).toBe(a.id);
    const second = await request('POST', `${f.path}/favorites`, f.owner, {
      targetType: 'team',
      targetId: f.teamId,
    });
    expect(second.statusCode).toBe(201);
    const b = second.json<{ data: Created }>().data;
    const reorder = await request(
      'POST',
      `${f.path}/favorites/reorder`,
      f.owner,
      {
        items: [
          { id: b.id, expectedRevision: 1 },
          { id: a.id, expectedRevision: 1 },
        ],
      },
    );
    expect(reorder.statusCode).toBe(200);
    const list = await request('GET', `${f.path}/favorites`, f.owner);
    if (list.statusCode !== 200) throw new Error(list.body);
    expect(
      list.json<{ data: { id: string }[] }>().data.map((row) => row.id),
    ).toEqual([b.id, a.id]);
    expect(
      (
        await request('DELETE', `${f.path}/favorites/${a.id}`, f.owner, {
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request('DELETE', `${f.path}/favorites/${a.id}`, f.owner, {
          expectedRevision: 2,
        })
      ).statusCode,
    ).toBe(200);
  });
  it('renders inaccessible/deleted favorites safely without leaking the target title or ID', async () => {
    const f = await fixture();
    const reader = await join(f.w);
    const work = await issue(f.w, f.teamId, f.owner, 'private target name');
    const favorite = await request('POST', `${f.path}/favorites`, reader.user, {
      targetType: 'issue',
      targetId: work.id,
    });
    expect(favorite.statusCode).toBe(201);
    await database.connection.query(
      "UPDATE teams SET visibility='PRIVATE' WHERE id=$1",
      [f.teamId],
    );
    const r = await request('GET', `${f.path}/favorites`, reader.user);
    expect(r.statusCode).toBe(200);
    expect(
      r.json<{
        data: {
          title: string | null;
          targetId: string | null;
          state: string;
        }[];
      }>().data[0],
    ).toMatchObject({ title: null, targetId: null, state: 'UNAVAILABLE' });
    expect(r.body).not.toContain('private target name');
    expect(
      (
        await request('POST', `${f.path}/favorites`, reader.user, {
          targetType: 'issue',
          targetId: work.id,
        })
      ).statusCode,
    ).toBe(404);
  });
  it('reauthorizes idempotent saved-view replay after its private scope becomes unavailable', async () => {
    const f = await fixture();
    const reader = await join(f.w);
    const key = randomUUID();
    const dto = {
      name: 'Scoped shared',
      resource: 'ISSUES',
      visibility: 'WORKSPACE',
      teamId: f.teamId,
      filters: { version: 1 },
    };
    const first = await request(
      'POST',
      `${f.path}/views`,
      reader.user,
      dto,
      key,
    );
    expect(first.statusCode).toBe(201);
    await database.connection.query(
      "UPDATE teams SET visibility='PRIVATE' WHERE id=$1",
      [f.teamId],
    );
    expect(
      (await request('POST', `${f.path}/views`, reader.user, dto, key))
        .statusCode,
    ).toBe(404);
    expect(
      (await request('GET', `${f.path}/views`, reader.user)).json<{
        meta: { total: number };
      }>().meta.total,
    ).toBe(0);
  });
  it('filters shared saved-view catalogs and favorites for guest and cross-tenant callers', async () => {
    const f = await fixture();
    const guest = await join(f.w, 'GUEST');
    const other = await fixture();
    await view(f.path, f.owner, { visibility: 'WORKSPACE' });
    const own = await view(f.path, guest.user, {
      visibility: 'PRIVATE',
      filters: { version: 1 },
    });
    const list = await request('GET', `${f.path}/views`, guest.user);
    expect(list.statusCode).toBe(200);
    expect(
      list.json<{ data: Created[]; meta: { total: number } }>().meta.total,
    ).toBe(1);
    expect(list.json<{ data: Created[] }>().data[0]!.id).toBe(own.id);
    expect(
      (
        await request('POST', `${f.path}/views`, guest.user, {
          name: 'Shared guest',
          resource: 'ISSUES',
          visibility: 'WORKSPACE',
          filters: { version: 1 },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request('POST', `${f.path}/favorites`, f.owner, {
          targetType: 'team',
          targetId: other.teamId,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await request('GET', `${other.path}/search?q=needle`, f.owner))
        .statusCode,
    ).toBe(404);
  });
  it('preserves typed initiative/view favorites and safely renders archive/trash states', async () => {
    const f = await fixture();
    const saved = await view(f.path, f.owner);
    const init = await request('POST', `${f.path}/initiatives`, f.owner, {
      name: 'Favorite initiative',
    });
    expect(init.statusCode).toBe(201);
    const initiativeId = init.json<{ data: Created }>().data.id;
    for (const target of [
      { targetType: 'view', targetId: saved.id },
      { targetType: 'initiative', targetId: initiativeId },
    ])
      expect(
        (await request('POST', `${f.path}/favorites`, f.owner, target))
          .statusCode,
      ).toBe(201);
    expect(
      (
        await request('POST', `${f.path}/views/${saved.id}/archive`, f.owner, {
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(200);
    let list = await request('GET', `${f.path}/favorites`, f.owner);
    expect(list.statusCode).toBe(200);
    expect(
      list
        .json<{ data: { targetType: string; state: string }[] }>()
        .data.find((row) => row.targetType === 'view')!.state,
    ).toBe('ARCHIVED');
    expect(
      (
        await request('DELETE', `${f.path}/views/${saved.id}`, f.owner, {
          expectedRevision: 2,
        })
      ).statusCode,
    ).toBe(200);
    list = await request('GET', `${f.path}/favorites`, f.owner);
    expect(
      list
        .json<{
          data: {
            targetType: string;
            state: string;
            targetId: string | null;
            title: string | null;
          }[];
        }>()
        .data.find((row) => row.targetType === 'view'),
    ).toMatchObject({ state: 'UNAVAILABLE', targetId: null, title: null });
    expect(
      (
        await request('POST', `${f.path}/favorites`, f.owner, {
          targetType: 'view',
          targetId: saved.id,
        })
      ).statusCode,
    ).toBe(404);
  });
  it('validates label scopes and filters project queries using permission-safe counts', async () => {
    const f = await fixture();
    const label = await request('POST', `${f.path}/labels`, f.owner, {
      name: 'Query label',
      color: '#112233',
    });
    expect(label.statusCode).toBe(201);
    const labelId = label.json<{ data: Created }>().data.id;
    const project = await request('POST', `${f.path}/projects`, f.owner, {
      name: 'needle project',
      teamIds: [f.teamId],
    });
    expect(project.statusCode).toBe(201);
    const projectId = project.json<{ data: Created }>().data.id;
    await database.connection.query(
      'INSERT INTO project_labels(id,workspace_id,project_id,label_id) VALUES($1,$2,$3,$4)',
      [randomUUID(), f.w, projectId, labelId],
    );
    const result = await request('POST', `${f.path}/views/query`, f.owner, {
      resource: 'PROJECTS',
      filters: {
        version: 1,
        teamId: f.teamId,
        labelId,
        statusCategory: 'PLANNED',
        text: 'needle',
        sort: 'TITLE_ASC',
      },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json<{ meta: { total: number } }>().meta.total).toBe(1);
    expect(
      (
        await request('POST', `${f.path}/views/query`, f.owner, {
          resource: 'ISSUES',
          filters: { version: 1, labelId: 'missing_label' },
        })
      ).statusCode,
    ).toBe(404);
  });
  it('archives, trashes, restores views and keeps mutations optimistic', async () => {
    const f = await fixture();
    const v = await view(f.path, f.owner);
    expect(
      (
        await request('POST', `${f.path}/views/${v.id}/archive`, f.owner, {
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request('GET', `${f.path}/views/${v.id}/results`, f.owner))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await request('POST', `${f.path}/views/${v.id}/restore`, f.owner, {
          expectedRevision: 2,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request('DELETE', `${f.path}/views/${v.id}`, f.owner, {
          expectedRevision: 3,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request('GET', `${f.path}/views/${v.id}`, f.owner)).statusCode,
    ).toBe(404);
    expect(
      (
        await request('POST', `${f.path}/views/${v.id}/restore`, f.owner, {
          expectedRevision: 4,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request('PATCH', `${f.path}/views/${v.id}`, f.owner, {
          expectedRevision: 5,
        })
      ).statusCode,
    ).toBe(400);
  });
});
