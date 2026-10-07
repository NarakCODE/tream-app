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

type ResponseData = {
  id: string;
  user: { fullName: string };
  activeWorkspace: {
    membership: { role: string };
    workspace: { slug: string };
  };
  onboarding: { nextStep: string; completedAt: string | null };
};
type User = { accessToken: string; user: { id: string } };
describe('Onboarding PostgreSQL HTTP contracts', () => {
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
  it('derives setup, persists membership completion and reauthorizes replay', async () => {
    const owner = await signup();
    expect(
      (await request('GET', '/bootstrap', owner)).json<{ data: ResponseData }>()
        .data.onboarding.nextStep,
    ).toBe('CREATE_WORKSPACE');
    const created = await request('POST', '/workspaces', owner, {
      name: 'Onboarding workspace',
      slug: `onboarding-${randomUUID()}`,
    });
    const workspaceId = created.json<{ data: ResponseData }>().data.id;
    const completion = `/workspaces/${workspaceId}/onboarding/complete`;
    expect(
      (await request('GET', '/bootstrap', owner)).json<{ data: ResponseData }>()
        .data.onboarding.nextStep,
    ).toBe('CREATE_TEAM');
    expect((await request('POST', completion, owner)).statusCode).toBe(409);
    const team = await request(
      'POST',
      `/workspaces/${workspaceId}/teams`,
      owner,
      { name: 'First team', key: 'FIRST', visibility: 'PRIVATE' },
    );
    expect(team.statusCode).toBe(201);
    const bootstrap = await request('GET', '/bootstrap', owner);
    expect(bootstrap.headers['cache-control']).toBe('no-store');
    expect(
      bootstrap.json<{ data: ResponseData }>().data.onboarding.nextStep,
    ).toBe('INVITE_TEAMMATES');
    const key = randomUUID();
    const results = await Promise.all([
      request('POST', completion, owner, undefined, key),
      request('POST', completion, owner),
      request('POST', completion, owner, undefined, key),
    ]);
    for (const result of results) {
      expect(result.statusCode).toBe(200);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(
        result.json<{ data: ResponseData }>().data.onboarding.nextStep,
      ).toBe('DONE');
    }
    const first = results[0].json<{ data: ResponseData }>().data.onboarding
      .completedAt;
    expect(
      results.map(
        (r) => r.json<{ data: ResponseData }>().data.onboarding.completedAt,
      ),
    ).toEqual([first, first, first]);
    await database.connection.query(
      'UPDATE users SET full_name=$1 WHERE id=$2',
      ['Updated owner', owner.user.id],
    );
    const refreshedReplay = await request(
      'POST',
      completion,
      owner,
      undefined,
      key,
    );
    expect(
      refreshedReplay.json<{ data: ResponseData }>().data.user.fullName,
    ).toBe('Updated owner');
    expect(
      refreshedReplay.json<{ data: ResponseData }>().data.onboarding
        .completedAt,
    ).toBe(first);
    const guest = await signup();
    await database.connection.query(
      "INSERT INTO memberships(id,workspace_id,user_id,role) VALUES($1,$2,$3,'GUEST')",
      [randomUUID(), workspaceId, guest.user.id],
    );
    expect(
      (await request('GET', '/bootstrap', guest)).json<{ data: ResponseData }>()
        .data.onboarding.nextStep,
    ).toBe('SELECT_WORKSPACE');
    await request('POST', `/workspaces/${workspaceId}/select`, guest);
    const guestBootstrap = (await request('GET', '/bootstrap', guest)).json<{
      data: ResponseData;
    }>().data;
    expect(guestBootstrap.onboarding).toMatchObject({
      setupReady: true,
      completed: false,
      nextStep: 'INVITE_TEAMMATES',
    });
    expect(guestBootstrap).not.toHaveProperty('teams');
    expect((await request('POST', completion, guest)).statusCode).toBe(200);
    // A retired team is insufficient even if historical completion is recorded.
    await database.connection.query(
      'UPDATE teams SET retired_at=now() WHERE workspace_id=$1',
      [workspaceId],
    );
    expect(
      (await request('GET', '/bootstrap', guest)).json<{ data: ResponseData }>()
        .data.onboarding,
    ).toMatchObject({
      setupReady: false,
      completed: false,
      nextStep: 'WAIT_FOR_TEAM',
    });
    expect(
      (await request('POST', completion, owner, undefined, key)).statusCode,
    ).toBe(409);
    await database.connection.query(
      'UPDATE teams SET retired_at=NULL WHERE workspace_id=$1',
      [workspaceId],
    );
    await database.connection.query(
      "UPDATE memberships SET state='SUSPENDED' WHERE workspace_id=$1 AND user_id=$2",
      [workspaceId, guest.user.id],
    );
    expect((await request('POST', completion, guest)).statusCode).toBe(404);
    // A cached owner completion must not replay into another selected workspace.
    await request('POST', '/workspaces', owner, {
      name: 'Second workspace',
      slug: `second-${randomUUID()}`,
    });
    expect(
      (await request('POST', completion, owner, undefined, key)).statusCode,
    ).toBe(409);
  });
  it('requires authentication and an idempotency key', async () => {
    expect((await request('GET', '/bootstrap')).statusCode).toBe(401);
    const owner = await signup();
    const created = await request('POST', '/workspaces', owner, {
      name: 'Key test',
      slug: `key-${randomUUID()}`,
    });
    const workspaceId = created.json<{ data: ResponseData }>().data.id;
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/onboarding/complete`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(response.statusCode).toBe(400);
  });
});
