import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import {
  configureApplication,
  createFastifyAdapter,
} from '../src/application.factory';
import { IdempotencyRepository } from '../src/common/idempotency/idempotency.repository';
import { DYNAMIC_DATA_REPOSITORY } from '../src/modules/dynamic-data/application/ports/dynamic-data-repository.port';
import { EVENT_DISPATCH_QUEUE } from '../src/modules/eventing/application/ports/event-dispatch-queue.port';
import { EVENT_STORE } from '../src/modules/eventing/application/ports/event-store.port';
import { AUTH_REPOSITORY } from '../src/modules/iam/application/ports/auth-repository.port';
import { MAGIC_LINK_SENDER } from '../src/modules/iam/application/ports/magic-link-sender.port';
import { WORKSPACE_REPOSITORY } from '../src/modules/iam/application/ports/workspace-repository.port';
import { InMemoryAuthRepository } from './helpers/in-memory-auth.repository';
import { InMemoryDynamicDataRepository } from './helpers/in-memory-dynamic-data.repository';
import { InMemoryEventingRepository } from './helpers/in-memory-eventing.repository';
import { InMemoryIdempotencyRepository } from './helpers/in-memory-idempotency.repository';
import { InMemoryWorkspaceRepository } from './helpers/in-memory-workspace.repository';
import { RecordingMagicLinkSender } from './helpers/recording-magic-link.sender';

interface Envelope<T> {
  data: T;
}

interface CursorEnvelope<T> {
  data: T[];
  meta: {
    nextCursor: string | null;
    hasNext: boolean;
    limit: number;
    total: number;
  };
}

interface ErrorEnvelope {
  error: { code: string };
}

interface Session {
  user: { id: string; email: string };
  accessToken: string;
}

interface WorkspaceResponse {
  id: string;
}

interface DatabaseResponse {
  id: string;
  workspaceId: string;
  name: string;
}

interface FieldResponse {
  id: string;
  key: string;
  type: string;
}

interface RecordResponse {
  id: string;
  values: Record<string, unknown>;
}

interface EventResponse {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
}

describe('Dynamic Data and Eventing API (e2e)', () => {
  let app: NestFastifyApplication;
  let auth: InMemoryAuthRepository;
  let workspaces: InMemoryWorkspaceRepository;
  let dynamicData: InMemoryDynamicDataRepository;
  let eventing: InMemoryEventingRepository;
  let idempotency: InMemoryIdempotencyRepository;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.JWT_ACCESS_SECRET =
      'test-access-secret-that-is-at-least-32-characters';
    auth = new InMemoryAuthRepository();
    workspaces = new InMemoryWorkspaceRepository(auth);
    eventing = new InMemoryEventingRepository(workspaces);
    dynamicData = new InMemoryDynamicDataRepository(workspaces, eventing);
    idempotency = new InMemoryIdempotencyRepository();

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(auth)
      .overrideProvider(WORKSPACE_REPOSITORY)
      .useValue(workspaces)
      .overrideProvider(DYNAMIC_DATA_REPOSITORY)
      .useValue(dynamicData)
      .overrideProvider(EVENT_STORE)
      .useValue(eventing)
      .overrideProvider(EVENT_DISPATCH_QUEUE)
      .useValue(eventing)
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
    eventing.reset();
    dynamicData.reset();
    idempotency.reset();
  });

  afterAll(async () => app.close());

  const bearer = (
    session: Session,
    idempotencyKey = randomUUID(),
  ): Record<string, string> => ({
    authorization: `Bearer ${session.accessToken}`,
    'idempotency-key': idempotencyKey,
  });

  const authOnly = (session: Session): Record<string, string> => ({
    authorization: `Bearer ${session.accessToken}`,
  });

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

  const createWorkspace = async (
    session: Session,
    slug: string,
  ): Promise<WorkspaceResponse> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: bearer(session),
      payload: { name: slug, slug },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<WorkspaceResponse>>().data;
  };

  const addMember = async (
    owner: Session,
    workspaceId: string,
    member: Session,
    role: 'MEMBER' | 'GUEST',
  ): Promise<void> => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: bearer(owner),
      payload: { email: member.user.email, role },
    });
    expect(response.statusCode).toBe(201);
  };

  const createDatabase = async (
    session: Session,
    workspaceId: string,
  ): Promise<DatabaseResponse> => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/databases`,
      headers: bearer(session),
      payload: { name: 'Accounts' },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<DatabaseResponse>>().data;
  };

  const createTextField = async (
    session: Session,
    databaseId: string,
    key = 'name',
  ): Promise<FieldResponse> => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/databases/${databaseId}/fields`,
      headers: bearer(session),
      payload: { name: key, key, type: 'TEXT', isRequired: true },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<FieldResponse>>().data;
  };

  const createRecord = async (
    session: Session,
    databaseId: string,
    values: Record<string, unknown>,
  ): Promise<RecordResponse> => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/databases/${databaseId}/records`,
      headers: bearer(session),
      payload: { values },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<RecordResponse>>().data;
  };

  it('creates records and appends durable event dispatch attempts', async () => {
    const owner = await signUp('owner@example.com');
    const workspace = await createWorkspace(owner, 'dynamic-team');
    const database = await createDatabase(owner, workspace.id);
    const field = await createTextField(owner, database.id);

    expect(database).toMatchObject({
      workspaceId: workspace.id,
      name: 'Accounts',
    });
    expect(field).toMatchObject({ key: 'name', type: 'TEXT' });

    const created = await createRecord(owner, database.id, { name: 'Acme' });
    expect(created.values).toMatchObject({ name: 'Acme' });

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/records/${created.id}`,
      headers: bearer(owner),
      payload: { values: { name: 'Acme Corp' } },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<Envelope<RecordResponse>>().data.values.name).toBe(
      'Acme Corp',
    );

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/records/${created.id}`,
      headers: authOnly(owner),
    });
    expect(deleted.statusCode).toBe(204);

    const recordEvents = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/events?eventType=database.record.created`,
      headers: authOnly(owner),
    });
    expect(recordEvents.statusCode).toBe(200);
    const event = recordEvents.json<CursorEnvelope<EventResponse>>().data[0];
    expect(event).toBeDefined();
    if (event === undefined) {
      throw new Error('Expected a record-created event.');
    }
    expect(event).toMatchObject({
      eventType: 'database.record.created',
      payload: { databaseId: database.id, recordId: created.id },
    });
    expect(eventing.attemptsForEvent(event.id)).toHaveLength(1);

    const eventDetails = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${event.id}`,
      headers: authOnly(owner),
    });
    expect(eventDetails.statusCode).toBe(200);

    const reprocess = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${event.id}/reprocess`,
      headers: bearer(owner),
    });
    expect(reprocess.statusCode).toBe(202);
    expect(eventing.attemptsForEvent(event.id)).toHaveLength(2);
  });

  it('keeps Dynamic Data tenant guarded and Events readable but not reprocessable by guests', async () => {
    const owner = await signUp('owner@example.com');
    const guest = await signUp('guest@example.com');
    const outsider = await signUp('outsider@example.com');
    const workspace = await createWorkspace(owner, 'dynamic-rbac-team');
    await addMember(owner, workspace.id, guest, 'GUEST');
    const database = await createDatabase(owner, workspace.id);
    await createTextField(owner, database.id);
    const record = await createRecord(owner, database.id, { name: 'Visible' });
    const [event] = eventing.eventsByType('database.record.created');
    expect(event).toBeDefined();
    if (event === undefined) {
      throw new Error('Expected a record-created event.');
    }

    const readAsGuest = await app.inject({
      method: 'GET',
      url: `/api/v1/databases/${database.id}/records`,
      headers: authOnly(guest),
    });
    expect(readAsGuest.statusCode).toBe(200);
    expect(readAsGuest.json<CursorEnvelope<RecordResponse>>().data[0]?.id).toBe(
      record.id,
    );

    const writeAsGuest = await app.inject({
      method: 'POST',
      url: `/api/v1/databases/${database.id}/records`,
      headers: bearer(guest),
      payload: { values: { name: 'Denied' } },
    });
    expect(writeAsGuest.statusCode).toBe(403);

    const hiddenFromOutsider = await app.inject({
      method: 'GET',
      url: `/api/v1/databases/${database.id}`,
      headers: authOnly(outsider),
    });
    expect(hiddenFromOutsider.statusCode).toBe(403);

    const eventReadAsGuest = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${event.id}`,
      headers: authOnly(guest),
    });
    expect(eventReadAsGuest.statusCode).toBe(200);

    const reprocessAsGuest = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${event.id}/reprocess`,
      headers: bearer(guest),
    });
    expect(reprocessAsGuest.statusCode).toBe(403);
  });

  it('allows no-key query reads and validates the finite query AST', async () => {
    const owner = await signUp('owner@example.com');
    const workspace = await createWorkspace(owner, 'dynamic-query-team');
    const database = await createDatabase(owner, workspace.id);
    await createTextField(owner, database.id);
    await createRecord(owner, database.id, { name: 'Alpha' });
    await createRecord(owner, database.id, { name: 'Beta' });

    const query = await app.inject({
      method: 'POST',
      url: `/api/v1/databases/${database.id}/query`,
      headers: authOnly(owner),
      payload: {
        filter: { field: 'name', operator: 'eq', value: 'Alpha' },
        limit: 10,
      },
    });
    expect(query.statusCode).toBe(200);
    expect(query.json<CursorEnvelope<RecordResponse>>().data).toHaveLength(1);

    const invalid = await app.inject({
      method: 'POST',
      url: `/api/v1/databases/${database.id}/query`,
      headers: authOnly(owner),
      payload: {
        filter: { field: 'name', operator: 'regex', value: '^A' },
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json<ErrorEnvelope>().error.code).toBe('VALIDATION_ERROR');
  });
});
