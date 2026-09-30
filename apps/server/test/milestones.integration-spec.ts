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
import {
  AuthMailOutbox,
  type MailMessage,
} from '../src/modules/iam/authentication/infrastructure/auth-mail-outbox';
import { prepareIntegrationDatabase } from './helpers/integration-environment';

interface Credentials {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; emailVerified: boolean };
}
const password = 'Integration-password-2026';

describe('M01–M04 PostgreSQL HTTP contracts', () => {
  let app: NestFastifyApplication;
  let outbox: AuthMailOutbox;
  let database: Awaited<ReturnType<typeof prepareIntegrationDatabase>>;
  const mail: MailMessage[] = [];
  let requestNumber = 0;

  beforeAll(async () => {
    database = await prepareIntegrationDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_MAIL_SENDER)
      .useValue({
        send: (message: MailMessage) => {
          mail.push(message);
          return Promise.resolve();
        },
      })
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
    outbox = app.get(AuthMailOutbox);
  });
  afterAll(async () => {
    await app?.close();
    await database?.cleanup();
  });

  function request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: object,
    auth?: Credentials,
    key?: string,
  ) {
    const headers: Record<string, string> = {};
    if (auth) headers.authorization = `Bearer ${auth.accessToken}`;
    if (key) headers['idempotency-key'] = key;
    return app.inject({
      method,
      url: path.startsWith('/health') ? path : `/api/v1${path}`,
      headers,
      remoteAddress: `10.10.${Math.floor(++requestNumber / 250)}.${(requestNumber % 250) + 1}`,
      ...(body ? { payload: body } : {}),
    });
  }
  async function signup(verified = true): Promise<Credentials> {
    const email = `integration-${randomUUID()}@example.test`;
    const response = await request('POST', '/auth/signup', {
      email,
      password,
      fullName: 'Integration User',
    });
    expect(response.statusCode).toBe(201);
    const auth = response.json<{ data: Credentials }>().data;
    if (verified) {
      await outbox.dispatchReady();
      const token = mailToken(email, 'verify-email');
      expect(
        (await request('POST', '/auth/email-verification/confirm', { token }))
          .statusCode,
      ).toBe(201);
    }
    return auth;
  }
  function mailToken(email: string, path: string) {
    const message = mail
      .filter((item) => item.to === email && item.text.includes(path))
      .at(-1);
    expect(message).toBeDefined();
    const link = message!.text.match(/https?:\/\/\S+/)?.[0];
    expect(link).toBeDefined();
    return (
      new URL(link!).searchParams.get('token') ??
      (() => {
        throw new Error('Missing token');
      })()
    );
  }
  async function workspace(owner: Credentials) {
    const response = await request(
      'POST',
      '/workspaces',
      { name: 'Integration workspace', slug: `integration-${randomUUID()}` },
      owner,
      randomUUID(),
    );
    expect(response.statusCode).toBe(201);
    return response.json<{ data: { id: string } }>().data;
  }
  async function invite(
    owner: Credentials,
    workspaceId: string,
    user: Credentials,
    role = 'MEMBER',
  ) {
    const response = await request(
      'POST',
      `/workspaces/${workspaceId}/invitations`,
      { email: user.user.email, role },
      owner,
      randomUUID(),
    );
    expect(response.statusCode).toBe(201);
    expect(JSON.stringify(response.json())).not.toContain('tokenHash');
    await outbox.dispatchReady();
    return {
      id: response.json<{ data: { id: string } }>().data.id,
      token: mailToken(user.user.email, 'accept-invitation'),
    };
  }
  async function join(
    owner: Credentials,
    workspaceId: string,
    user: Credentials,
    role = 'MEMBER',
  ) {
    const invitation = await invite(owner, workspaceId, user, role);
    const response = await request(
      'POST',
      '/workspaces/invitations/accept',
      { token: invitation.token },
      user,
      randomUUID(),
    );
    expect(response.statusCode).toBe(201);
    return response.json<{ data: { id: string } }>().data;
  }

  it('serves readiness and denies anonymous protected routes', async () => {
    const ready = await request('GET', '/health/ready');
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready' });
    expect(ready.headers['x-request-id']).toBeDefined();
    expect((await request('GET', '/me')).statusCode).toBe(401);
    expect((await request('GET', '/workspaces')).statusCode).toBe(401);
  });
  it('rejects an ownerless workspace, tenant-mismatched actors, and immutable fact mutation in PostgreSQL', async () => {
    await expect(
      database.connection.query(
        'INSERT INTO workspaces(id,name,slug) VALUES ($1,$2,$3)',
        [randomUUID(), 'Ownerless', `ownerless-${randomUUID()}`],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const owner = await signup();
    const first = await workspace(owner);
    const second = await workspace(owner);
    const members = await database.connection.query<{ id: string }>(
      'SELECT id FROM memberships WHERE workspace_id=$1 AND user_id=$2',
      [second.id, owner.user.id],
    );
    await expect(
      database.connection.query(
        'INSERT INTO audit_logs(id,workspace_id,actor_id,action,target_type,target_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [
          randomUUID(),
          first.id,
          members.rows[0]!.id,
          'test.invalid',
          'workspace',
          first.id,
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      database.connection.query(
        'UPDATE audit_logs SET action=$1 WHERE workspace_id=$2',
        ['tampered', first.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.connection.query('DELETE FROM events WHERE workspace_id=$1', [
        first.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.connection.query(
        "UPDATE memberships SET role='MEMBER' WHERE workspace_id=$1",
        [first.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('enforces persisted public-endpoint rate limits', async () => {
    const email = `rate-${randomUUID()}@example.test`;
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/email-verification/request',
        remoteAddress: '10.250.0.1',
        payload: { email },
      });
      statuses.push(response.statusCode);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });
  it('validates signup, verifies email once, and authenticates with persisted credentials', async () => {
    expect(
      (
        await request('POST', '/auth/signup', {
          email: 'invalid',
          password: 'short',
          fullName: '',
        })
      ).statusCode,
    ).toBe(400);
    const user = await signup(false);
    await outbox.dispatchReady();
    const token = mailToken(user.user.email, 'verify-email');
    expect(
      (await request('POST', '/auth/email-verification/confirm', { token }))
        .statusCode,
    ).toBe(201);
    expect(
      (await request('POST', '/auth/email-verification/confirm', { token }))
        .statusCode,
    ).toBe(401);
    const login = await request('POST', '/auth/login', {
      email: user.user.email,
      password,
    });
    expect(login.statusCode).toBe(201);
    const profile = await request(
      'GET',
      '/me',
      undefined,
      login.json<{ data: Credentials }>().data,
    );
    expect(profile.statusCode).toBe(200);
    expect(
      profile.json<{ data: { emailVerified: boolean } }>().data.emailVerified,
    ).toBeTruthy();
    expect(profile.body).not.toContain('passwordHash');
    expect(
      (
        await request('POST', '/auth/login', {
          email: user.user.email,
          password: 'wrong',
        })
      ).statusCode,
    ).toBe(401);
  });
  it('rotates refresh sessions and revokes the family on reuse', async () => {
    const original = await signup();
    const rotated = await request('POST', '/auth/refresh', {
      refreshToken: original.refreshToken,
    });
    expect(rotated.statusCode).toBe(201);
    const current = rotated.json<{ data: Credentials }>().data;
    expect(current.refreshToken).not.toBe(original.refreshToken);
    expect((await request('GET', '/me', undefined, original)).statusCode).toBe(
      401,
    );
    expect(
      (
        await request('POST', '/auth/refresh', {
          refreshToken: original.refreshToken,
        })
      ).statusCode,
    ).toBe(401);
    expect((await request('GET', '/me', undefined, current)).statusCode).toBe(
      401,
    );
    expect(
      (
        await request('POST', '/auth/refresh', {
          refreshToken: current.refreshToken,
        })
      ).statusCode,
    ).toBe(401);
  });
  it('keeps browser refresh credentials HttpOnly and enforces allowed origins', async () => {
    const user = await signup();
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'http://localhost:3001' },
      payload: { email: user.user.email, password },
    });
    expect(login.statusCode).toBe(201);
    expect(
      login.json<{ data: Record<string, unknown> }>().data.refreshToken,
    ).toBeUndefined();
    const cookie = String(login.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: {
        origin: 'http://localhost:3001',
        cookie: cookie.split(';')[0]!,
      },
      payload: {},
    });
    expect(refresh.statusCode).toBe(201);
    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: {
        origin: 'https://attacker.example',
        cookie: cookie.split(';')[0]!,
      },
      payload: {},
    });
    expect(denied.statusCode).toBe(401);
  });
  it('resets a password once and immediately revokes previous access sessions', async () => {
    const user = await signup();
    const recovery = await request('POST', '/auth/password-recovery', {
      email: user.user.email,
    });
    expect(recovery.statusCode).toBe(201);
    const unknown = await request('POST', '/auth/password-recovery', {
      email: `unknown-${randomUUID()}@example.test`,
    });
    expect(unknown.json<{ data: unknown }>().data).toEqual(
      recovery.json<{ data: unknown }>().data,
    );
    await outbox.dispatchReady();
    const token = mailToken(user.user.email, 'password-reset');
    const nextPassword = 'Replaced-integration-password';
    expect(
      (
        await request('POST', '/auth/password-reset', {
          token,
          password: nextPassword,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await request('POST', '/auth/password-reset', {
          token,
          password: nextPassword,
        })
      ).statusCode,
    ).toBe(401);
    expect((await request('GET', '/me', undefined, user)).statusCode).toBe(401);
    expect(
      (
        await request('POST', '/auth/login', {
          email: user.user.email,
          password,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await request('POST', '/auth/login', {
          email: user.user.email,
          password: nextPassword,
        })
      ).statusCode,
    ).toBe(201);
  });
  it('consumes magic links once and revokes logout sessions immediately', async () => {
    const user = await signup();
    expect(
      (
        await request('POST', '/auth/magic-link/request', {
          email: user.user.email,
        })
      ).statusCode,
    ).toBe(201);
    await outbox.dispatchReady();
    const token = mailToken(user.user.email, 'magic-link');
    const consumed = await request('POST', '/auth/magic-link/consume', {
      token,
    });
    expect(consumed.statusCode).toBe(201);
    const auth = consumed.json<{ data: Credentials }>().data;
    expect(
      (await request('POST', '/auth/magic-link/consume', { token })).statusCode,
    ).toBe(401);
    expect((await request('POST', '/auth/logout', {}, auth)).statusCode).toBe(
      201,
    );
    expect((await request('GET', '/me', undefined, auth)).statusCode).toBe(401);
    expect((await request('GET', '/me', undefined, user)).statusCode).toBe(200);
    expect(
      (await request('POST', '/auth/logout-all', {}, user)).statusCode,
    ).toBe(201);
    expect((await request('GET', '/me', undefined, user)).statusCode).toBe(401);
  });
  it('replays workspace creation under concurrency and rejects changed payloads', async () => {
    const owner = await signup();
    const key = randomUUID();
    const body = { name: 'Replay workspace', slug: `replay-${randomUUID()}` };
    const responses = await Promise.all([
      request('POST', '/workspaces', body, owner, key),
      request('POST', '/workspaces', body, owner, key),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([
      201, 201,
    ]);
    expect(responses[0].json<{ data: unknown }>().data).toEqual(
      responses[1].json<{ data: unknown }>().data,
    );
    expect(
      (
        await request(
          'POST',
          '/workspaces',
          { ...body, name: 'Changed' },
          owner,
          key,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request(
          'POST',
          '/workspaces',
          { ...body, slug: `missing-${randomUUID()}` },
          owner,
        )
      ).statusCode,
    ).toBe(400);
  });
  it('isolates tenants and prevents removing or demoting the final owner', async () => {
    const owner = await signup();
    const stranger = await signup();
    const wsp = await workspace(owner);
    expect(
      (await request('GET', `/workspaces/${wsp.id}`, undefined, stranger))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${wsp.id}`,
          { name: 'Unauthorized' },
          stranger,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(404);
    const members = await request(
      'GET',
      `/workspaces/${wsp.id}/members`,
      undefined,
      owner,
    );
    const membershipId = members.json<{ data: { id: string }[] }>().data[0]!.id;
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${wsp.id}/members/${membershipId}`,
          { role: 'MEMBER' },
          owner,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request(
          'DELETE',
          `/workspaces/${wsp.id}/members/${membershipId}`,
          undefined,
          owner,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(409);
  });
  it('returns canonical cursor pagination for workspaces, members, and invitations', async () => {
    const owner = await signup();
    const invited = await signup();
    const first = await workspace(owner);
    await workspace(owner);
    const page = await request('GET', '/workspaces?limit=1', undefined, owner);
    expect(page.statusCode).toBe(200);
    const body = page.json<{
      data: { id: string }[];
      meta: {
        nextCursor: string;
        total: number;
        limit: number;
        hasNext: boolean;
      };
    }>();
    expect(body.data).toHaveLength(1);
    expect(body.meta).toMatchObject({ total: 2, limit: 1, hasNext: true });
    expect(body.meta.nextCursor).toEqual(expect.any(String));
    const next = await request(
      'GET',
      `/workspaces?limit=1&cursor=${encodeURIComponent(body.meta.nextCursor)}`,
      undefined,
      owner,
    );
    const nextBody = next.json<{
      data: { id: string }[];
      meta: { total: number; hasNext: boolean; nextCursor: null };
    }>();
    expect(nextBody.data).toHaveLength(1);
    expect(nextBody.data[0]!.id).not.toBe(body.data[0]!.id);
    expect(nextBody.meta).toMatchObject({
      total: 2,
      hasNext: false,
      nextCursor: null,
    });
    const members = await request(
      'GET',
      `/workspaces/${first.id}/members?limit=1`,
      undefined,
      owner,
    );
    expect(members.json<{ data: unknown[] }>().data).toHaveLength(1);
    expect(members.json<{ meta: unknown }>().meta).toMatchObject({
      total: 1,
      hasNext: false,
    });
    await join(owner, first.id, invited);
    await invite(owner, first.id, await signup());
    const invitations = await request(
      'GET',
      `/workspaces/${first.id}/invitations?limit=1`,
      undefined,
      owner,
    );
    expect(invitations.json<{ data: unknown[] }>().data).toHaveLength(1);
    expect(invitations.json<{ meta: unknown }>().meta).toMatchObject({
      total: 2,
      hasNext: true,
    });
    for (const collection of ['members', 'invitations']) {
      const path = `/workspaces/${first.id}/${collection}?limit=1`;
      const initial = (await request('GET', path, undefined, owner)).json<{
        data: { id: string }[];
        meta: { nextCursor: string; total: number; hasNext: boolean };
      }>();
      expect(initial.meta).toMatchObject({ total: 2, hasNext: true });
      const subsequent = (
        await request(
          'GET',
          `${path}&cursor=${encodeURIComponent(initial.meta.nextCursor)}`,
          undefined,
          owner,
        )
      ).json<{
        data: { id: string }[];
        meta: { nextCursor: null; total: number; hasNext: boolean };
      }>();
      expect(subsequent.data).toHaveLength(1);
      expect(subsequent.data[0]!.id).not.toBe(initial.data[0]!.id);
      expect(subsequent.meta).toMatchObject({
        total: 2,
        hasNext: false,
        nextCursor: null,
      });
    }
  });
  it('requires matching verified invitation email and rejects revoked invitations', async () => {
    const owner = await signup();
    const unverified = await signup(false);
    const stranger = await signup();
    const wsp = await workspace(owner);
    const invitation = await invite(owner, wsp.id, unverified);
    expect(
      (
        await request(
          'POST',
          '/workspaces/invitations/accept',
          { token: invitation.token },
          unverified,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          'POST',
          '/workspaces/invitations/accept',
          { token: invitation.token },
          stranger,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(403);
    const verification = mailToken(unverified.user.email, 'verify-email');
    expect(
      (
        await request('POST', '/auth/email-verification/confirm', {
          token: verification,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await request(
          'DELETE',
          `/workspaces/${wsp.id}/invitations/${invitation.id}`,
          undefined,
          owner,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          'POST',
          '/workspaces/invitations/accept',
          { token: invitation.token },
          unverified,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(409);
  });
  it('rejects expired invitations and limits guest access', async () => {
    const owner = await signup();
    const guest = await signup();
    const wsp = await workspace(owner);
    const invitation = await invite(owner, wsp.id, guest, 'GUEST');
    await database.connection.query(
      "UPDATE workspace_invitations SET created_at=now()-interval '8 days', expires_at=now()-interval '1 second' WHERE id=$1",
      [invitation.id],
    );
    expect(
      (
        await request(
          'POST',
          '/workspaces/invitations/accept',
          { token: invitation.token },
          guest,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(409);
    await join(owner, wsp.id, guest, 'GUEST');
    expect(
      (await request('GET', `/workspaces/${wsp.id}`, undefined, guest))
        .statusCode,
    ).toBe(200);
    expect(
      (await request('GET', `/workspaces/${wsp.id}/members`, undefined, guest))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${wsp.id}`,
          { name: 'Guest edit' },
          guest,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(403);
  });
  it('enforces role boundaries and refreshes permissions before command replay', async () => {
    const owner = await signup();
    const admin = await signup();
    const member = await signup();
    const wsp = await workspace(owner);
    const adminMember = await join(owner, wsp.id, admin, 'ADMIN');
    const regular = await join(owner, wsp.id, member);
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${wsp.id}`,
          { name: 'Denied member' },
          member,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${wsp.id}/members/${regular.id}`,
          { role: 'ADMIN' },
          admin,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${wsp.id}/members/${adminMember.id}`,
          { role: 'OWNER' },
          admin,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(403);
    const key = randomUUID();
    const body = { name: 'Admin permitted' };
    expect(
      (await request('PATCH', `/workspaces/${wsp.id}`, body, admin, key))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${wsp.id}/members/${adminMember.id}`,
          { role: 'MEMBER' },
          owner,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await request('PATCH', `/workspaces/${wsp.id}`, body, admin, key))
        .statusCode,
    ).toBe(403);
  });
  it('serializes concurrent owner demotions and preserves one active owner', async () => {
    const owner = await signup();
    const next = await signup();
    const wsp = await workspace(owner);
    const second = await join(owner, wsp.id, next, 'OWNER');
    const members = await request(
      'GET',
      `/workspaces/${wsp.id}/members`,
      undefined,
      owner,
    );
    const first = members
      .json<{ data: { id: string; userId: string }[] }>()
      .data.find((item) => item.userId === owner.user.id)!;
    const results = await Promise.all([
      request(
        'PATCH',
        `/workspaces/${wsp.id}/members/${first.id}`,
        { role: 'MEMBER' },
        owner,
        randomUUID(),
      ),
      request(
        'PATCH',
        `/workspaces/${wsp.id}/members/${second.id}`,
        { role: 'MEMBER' },
        next,
        randomUUID(),
      ),
    ]);
    expect(results.map((response) => response.statusCode).sort()).toEqual([
      200, 409,
    ]);
    const remaining = await request(
      'GET',
      `/workspaces/${wsp.id}/members`,
      undefined,
      owner,
    );
    expect(
      remaining
        .json<{ data: { role: string; state: string }[] }>()
        .data.filter(
          (item) => item.role === 'OWNER' && item.state === 'ACTIVE',
        ),
    ).toHaveLength(1);
  });
  it('persists scoped preferences and supports archive, trash, and owner restoration', async () => {
    const owner = await signup();
    const wsp = await workspace(owner);
    const preference = { theme: 'dark', timezone: 'Asia/Phnom_Penh' };
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${wsp.id}/preferences`,
          preference,
          owner,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          'GET',
          `/workspaces/${wsp.id}/preferences`,
          undefined,
          owner,
        )
      ).json<{ data: unknown }>().data,
    ).toEqual(preference);
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${wsp.id}`,
          { lifecycle: 'archive' },
          owner,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${wsp.id}/preferences`,
          preference,
          owner,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${wsp.id}`,
          { lifecycle: 'restore' },
          owner,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          'DELETE',
          `/workspaces/${wsp.id}`,
          undefined,
          owner,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await request('GET', `/workspaces/${wsp.id}`, undefined, owner))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${wsp.id}`,
          { lifecycle: 'restore' },
          owner,
          randomUUID(),
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await request('GET', `/workspaces/${wsp.id}`, undefined, owner))
        .statusCode,
    ).toBe(200);
  });
});
