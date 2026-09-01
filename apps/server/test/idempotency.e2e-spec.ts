import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import {
  configureApplication,
  createFastifyAdapter,
} from '../src/application.factory';
import { IdempotencyRepository } from '../src/common/idempotency/idempotency.repository';
import { AUTH_REPOSITORY } from '../src/modules/iam/application/ports/auth-repository.port';
import { MAGIC_LINK_SENDER } from '../src/modules/iam/application/ports/magic-link-sender.port';
import { WORKSPACE_REPOSITORY } from '../src/modules/iam/application/ports/workspace-repository.port';
import { InMemoryAuthRepository } from './helpers/in-memory-auth.repository';
import { InMemoryIdempotencyRepository } from './helpers/in-memory-idempotency.repository';
import { InMemoryWorkspaceRepository } from './helpers/in-memory-workspace.repository';
import { RecordingMagicLinkSender } from './helpers/recording-magic-link.sender';

interface Envelope<T> {
  data: T;
  meta: { requestId: string; timestamp: string };
}

interface ErrorEnvelope {
  error: { code: string; message: string };
}

interface Session {
  user: { id: string; email: string };
  accessToken: string;
}

interface WorkspaceResponse {
  id: string;
  name: string;
  slug: string;
}

describe('Idempotency API (e2e)', () => {
  let app: NestFastifyApplication;
  let auth: InMemoryAuthRepository;
  let workspaces: InMemoryWorkspaceRepository;
  let idempotency: InMemoryIdempotencyRepository;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.JWT_ACCESS_SECRET =
      'test-access-secret-that-is-at-least-32-characters';
    auth = new InMemoryAuthRepository();
    workspaces = new InMemoryWorkspaceRepository(auth);
    idempotency = new InMemoryIdempotencyRepository();

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(auth)
      .overrideProvider(WORKSPACE_REPOSITORY)
      .useValue(workspaces)
      .overrideProvider(IdempotencyRepository)
      .useValue(idempotency)
      .overrideProvider(MAGIC_LINK_SENDER)
      .useValue(new RecordingMagicLinkSender())
      .compile();

    app = module.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter(),
      { bufferLogs: true },
    );
    await configureApplication(app);
  });

  beforeEach(() => {
    auth.reset();
    workspaces.reset();
    idempotency.reset();
  });

  afterAll(async () => app.close());

  const signUp = async (email: string): Promise<Session> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: {
        email,
        fullName: email.split('@')[0],
        password: 'a secure passphrase',
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<Session>>().data;
  };

  const bearer = (
    session: Session,
    idempotencyKey = randomUUID(),
  ): Record<string, string> => ({
    authorization: `Bearer ${session.accessToken}`,
    'idempotency-key': idempotencyKey,
  });

  it('requires an idempotency key for authenticated POST and PATCH requests', async () => {
    const session = await signUp('owner@example.com');

    const missingPostKey = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { name: 'No Key', slug: 'no-key' },
    });
    expect(missingPostKey.statusCode).toBe(400);
    expect(missingPostKey.json<ErrorEnvelope>().error.code).toBe('BAD_REQUEST');

    const missingPatchKey = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { fullName: 'No Key' },
    });
    expect(missingPatchKey.statusCode).toBe(400);
    expect(missingPatchKey.json<ErrorEnvelope>().error.message).toContain(
      'Idempotency-Key',
    );
  });

  it('replays the stored transformed response for the same key and payload', async () => {
    const session = await signUp('owner@example.com');
    const idempotencyKey = randomUUID();
    const request = {
      method: 'POST' as const,
      url: '/api/v1/workspaces',
      headers: bearer(session, idempotencyKey),
      payload: { name: 'Platform', slug: 'platform' },
    };

    const created = await app.inject(request);
    const replayed = await app.inject(request);

    expect(created.statusCode).toBe(201);
    expect(replayed.statusCode).toBe(201);
    expect(replayed.headers['idempotency-replayed']).toBe('true');
    expect(replayed.json<Envelope<WorkspaceResponse>>()).toEqual(
      created.json<Envelope<WorkspaceResponse>>(),
    );
  });

  it('rejects reusing a key with a different payload on the same route', async () => {
    const session = await signUp('owner@example.com');
    const idempotencyKey = randomUUID();

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: bearer(session, idempotencyKey),
      payload: { name: 'First', slug: 'first' },
    });
    expect(first.statusCode).toBe(201);

    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: bearer(session, idempotencyKey),
      payload: { name: 'Second', slug: 'second' },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json<ErrorEnvelope>().error.code).toBe('RESOURCE_CONFLICT');
  });

  it('scopes a key to the concrete workspace path', async () => {
    const session = await signUp('owner@example.com');
    const firstWorkspace = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: bearer(session),
      payload: { name: 'First Workspace', slug: 'first-workspace' },
    });
    const secondWorkspace = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: bearer(session),
      payload: { name: 'Second Workspace', slug: 'second-workspace' },
    });
    const firstId = firstWorkspace.json<Envelope<WorkspaceResponse>>().data.id;
    const secondId =
      secondWorkspace.json<Envelope<WorkspaceResponse>>().data.id;
    const idempotencyKey = randomUUID();
    const payload = { name: 'Renamed Workspace' };

    const firstUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${firstId}`,
      headers: bearer(session, idempotencyKey),
      payload,
    });
    const secondUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${secondId}`,
      headers: bearer(session, idempotencyKey),
      payload,
    });

    expect(firstUpdate.statusCode).toBe(200);
    expect(secondUpdate.statusCode).toBe(200);
    expect(secondUpdate.headers['idempotency-replayed']).toBeUndefined();
    expect(secondUpdate.json<Envelope<WorkspaceResponse>>().data.id).toBe(
      secondId,
    );
  });
});
