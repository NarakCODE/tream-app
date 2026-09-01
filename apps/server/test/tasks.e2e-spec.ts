import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import {
  configureApplication,
  createFastifyAdapter,
} from '../src/application.factory';
import { IdempotencyRepository } from '../src/common/idempotency/idempotency.repository';
import { COMPANIES_REPOSITORY } from '../src/modules/companies/application/ports/companies-repository.port';
import { CONTACTS_REPOSITORY } from '../src/modules/contacts/application/ports/contacts-repository.port';
import { DEALS_REPOSITORY } from '../src/modules/deals/application/ports/deals-repository.port';
import { AUTH_REPOSITORY } from '../src/modules/iam/application/ports/auth-repository.port';
import { MAGIC_LINK_SENDER } from '../src/modules/iam/application/ports/magic-link-sender.port';
import { WORKSPACE_REPOSITORY } from '../src/modules/iam/application/ports/workspace-repository.port';
import { TASKS_REPOSITORY } from '../src/modules/tasks/application/ports/tasks-repository.port';
import { InMemoryAuthRepository } from './helpers/in-memory-auth.repository';
import { InMemoryCompaniesRepository } from './helpers/in-memory-companies.repository';
import { InMemoryContactsRepository } from './helpers/in-memory-contacts.repository';
import { InMemoryDealsRepository } from './helpers/in-memory-deals.repository';
import {
  idempotentBearer,
  InMemoryIdempotencyRepository,
} from './helpers/in-memory-idempotency.repository';
import { InMemoryTasksRepository } from './helpers/in-memory-tasks.repository';
import { InMemoryWorkspaceRepository } from './helpers/in-memory-workspace.repository';
import { RecordingMagicLinkSender } from './helpers/recording-magic-link.sender';

interface Envelope<T> {
  data: T;
}

interface CursorEnvelope<T> {
  data: T[];
  meta: {
    cursor: string | null;
    nextCursor: string | null;
    hasNext: boolean;
    limit: number;
    total: number;
  };
}

interface ErrorEnvelope {
  error: { code: string; details: unknown };
}

interface Session {
  user: { id: string; email: string };
  accessToken: string;
}

interface TaskResponse {
  id: string;
  workspaceId: string;
  contactId: string | null;
  dealId: string | null;
  assigneeId: string | null;
  title: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

describe('Tasks API (e2e)', () => {
  let app: NestFastifyApplication;
  let auth: InMemoryAuthRepository;
  let workspaces: InMemoryWorkspaceRepository;
  let companies: InMemoryCompaniesRepository;
  let contacts: InMemoryContactsRepository;
  let deals: InMemoryDealsRepository;
  let tasks: InMemoryTasksRepository;
  let idempotency: InMemoryIdempotencyRepository;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.JWT_ACCESS_SECRET =
      'test-access-secret-that-is-at-least-32-characters';
    auth = new InMemoryAuthRepository();
    workspaces = new InMemoryWorkspaceRepository(auth);
    companies = new InMemoryCompaniesRepository(workspaces);
    contacts = new InMemoryContactsRepository(workspaces);
    deals = new InMemoryDealsRepository(workspaces);
    tasks = new InMemoryTasksRepository(workspaces);
    idempotency = new InMemoryIdempotencyRepository();
    contacts.setCompanyValidator((workspaceId, companyId) =>
      companies.isActiveInWorkspace(workspaceId, companyId),
    );
    contacts.setDealContactProvider((workspaceId, dealId) =>
      deals.getContactIds(workspaceId, dealId),
    );
    deals.setCompanyValidator((workspaceId, companyId) =>
      companies.isActiveInWorkspace(workspaceId, companyId),
    );
    deals.setContactValidator((workspaceId, contactId) =>
      contacts.isActiveInWorkspace(workspaceId, contactId),
    );
    tasks.setContactValidator((workspaceId, contactId) =>
      contacts.isActiveInWorkspace(workspaceId, contactId),
    );
    tasks.setDealValidator((workspaceId, dealId) =>
      deals.isActiveInWorkspace(workspaceId, dealId),
    );

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(auth)
      .overrideProvider(WORKSPACE_REPOSITORY)
      .useValue(workspaces)
      .overrideProvider(COMPANIES_REPOSITORY)
      .useValue(companies)
      .overrideProvider(CONTACTS_REPOSITORY)
      .useValue(contacts)
      .overrideProvider(DEALS_REPOSITORY)
      .useValue(deals)
      .overrideProvider(TASKS_REPOSITORY)
      .useValue(tasks)
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
    companies.reset();
    contacts.reset();
    deals.reset();
    tasks.reset();
    idempotency.reset();
  });

  afterAll(async () => app.close());

  const bearer = (session: Session) => ({
    ...idempotentBearer(session.accessToken),
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

  const createWorkspace = async (session: Session, slug: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: bearer(session),
      payload: { name: slug, slug },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<{ id: string }>>().data;
  };

  const addMember = async (
    owner: Session,
    workspaceId: string,
    member: Session,
    role: 'MEMBER' | 'GUEST',
  ) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: bearer(owner),
      payload: { email: member.user.email, role },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<{ id: string }>>().data;
  };

  const createContact = async (
    owner: Session,
    workspaceId: string,
    email: string,
  ) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/contacts`,
      headers: bearer(owner),
      payload: { email },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<{ id: string }>>().data;
  };

  const createDeal = async (owner: Session, workspaceId: string) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/deals`,
      headers: bearer(owner),
      payload: { title: 'Task source deal' },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<{ id: string }>>().data;
  };

  const createTask = async (
    session: Session,
    workspaceId: string,
    title: string,
    extra: Record<string, unknown> = {},
  ): Promise<TaskResponse> => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/tasks`,
      headers: bearer(session),
      payload: { title, ...extra },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<TaskResponse>>().data;
  };

  it('creates linked TODO tasks and supports get, patch, filters, and cursors', async () => {
    const owner = await signUp('owner@example.com');
    const member = await signUp('member@example.com');
    const workspace = await createWorkspace(owner, 'task-crud-team');
    const membership = await addMember(owner, workspace.id, member, 'MEMBER');
    const contact = await createContact(owner, workspace.id, 'ada@example.com');
    const deal = await createDeal(owner, workspace.id);
    const first = await createTask(owner, workspace.id, 'Follow up', {
      contactId: contact.id,
      dealId: deal.id,
      assigneeId: membership.id,
      dueDate: '2027-01-01T00:00:00.000Z',
    });
    await createTask(owner, workspace.id, 'Second');
    await createTask(owner, workspace.id, 'Third');

    expect(first).toMatchObject({
      workspaceId: workspace.id,
      contactId: contact.id,
      dealId: deal.id,
      assigneeId: membership.id,
      status: 'TODO',
    });
    expect(first.id).toMatch(/^tsk_[0-9A-HJKMNP-TV-Z]{26}$/);

    const found = await app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${first.id}`,
      headers: bearer(member),
    });
    expect(found.statusCode).toBe(200);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${first.id}`,
      headers: bearer(owner),
      payload: { title: 'In progress', status: 'IN_PROGRESS', dueDate: null },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<Envelope<TaskResponse>>().data).toMatchObject({
      title: 'In progress',
      status: 'IN_PROGRESS',
      dueDate: null,
    });

    const filtered = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/tasks?status=IN_PROGRESS&assigneeId=${membership.id}`,
      headers: bearer(owner),
    });
    expect(filtered.json<CursorEnvelope<TaskResponse>>().data).toHaveLength(1);

    const pageOneResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/tasks?limit=2`,
      headers: bearer(owner),
    });
    const pageOne = pageOneResponse.json<CursorEnvelope<TaskResponse>>();
    expect(pageOne.data).toHaveLength(2);
    expect(pageOne.meta).toMatchObject({ hasNext: true, limit: 2, total: 3 });
    const pageTwo = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/tasks?limit=2&cursor=${pageOne.meta.nextCursor}`,
      headers: bearer(owner),
    });
    expect(pageTwo.json<CursorEnvelope<TaskResponse>>().data).toHaveLength(1);

    const createDone = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspace.id}/tasks`,
      headers: bearer(owner),
      payload: { title: 'Not allowed', status: 'DONE' },
    });
    expect(createDone.statusCode).toBe(400);
  });

  it('completes and reopens idempotently and rejects patching DONE', async () => {
    const owner = await signUp('owner@example.com');
    const workspace = await createWorkspace(owner, 'task-action-team');
    const task = await createTask(owner, workspace.id, 'Action task');

    const completedResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/complete`,
      headers: bearer(owner),
    });
    expect(completedResponse.statusCode).toBe(200);
    const completed = completedResponse.json<Envelope<TaskResponse>>().data;
    expect(completed.status).toBe('DONE');

    const completedAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/complete`,
      headers: bearer(owner),
    });
    expect(completedAgain.json<Envelope<TaskResponse>>().data.updatedAt).toBe(
      completed.updatedAt,
    );

    const invalidPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${task.id}`,
      headers: bearer(owner),
      payload: { status: 'IN_PROGRESS' },
    });
    expect(invalidPatch.statusCode).toBe(409);

    const reopenedResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/reopen`,
      headers: bearer(owner),
    });
    const reopened = reopenedResponse.json<Envelope<TaskResponse>>().data;
    expect(reopened.status).toBe('TODO');
    const reopenedAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/reopen`,
      headers: bearer(owner),
    });
    expect(reopenedAgain.json<Envelope<TaskResponse>>().data.updatedAt).toBe(
      reopened.updatedAt,
    );
  });

  it('assigns any workspace role and rejects foreign references', async () => {
    const owner = await signUp('owner@example.com');
    const guest = await signUp('guest@example.com');
    const workspace = await createWorkspace(owner, 'task-assign-team');
    const foreignWorkspace = await createWorkspace(owner, 'task-foreign-team');
    const guestMembership = await addMember(
      owner,
      workspace.id,
      guest,
      'GUEST',
    );
    const foreignMembership = await addMember(
      owner,
      foreignWorkspace.id,
      await signUp('foreign-member@example.com'),
      'MEMBER',
    );
    const task = await createTask(owner, workspace.id, 'Assign task');

    const assigned = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/assign`,
      headers: bearer(owner),
      payload: { memberId: guestMembership.id },
    });
    expect(assigned.statusCode).toBe(200);
    expect(assigned.json<Envelope<TaskResponse>>().data.assigneeId).toBe(
      guestMembership.id,
    );

    const foreignAssignment = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/assign`,
      headers: bearer(owner),
      payload: { memberId: foreignMembership.id },
    });
    expect(foreignAssignment.statusCode).toBe(404);

    const foreignContact = await createContact(
      owner,
      foreignWorkspace.id,
      'foreign@example.com',
    );
    const foreignDeal = await createDeal(owner, foreignWorkspace.id);
    for (const payload of [
      { title: 'Bad contact', contactId: foreignContact.id },
      { title: 'Bad deal', dealId: foreignDeal.id },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspace.id}/tasks`,
        headers: bearer(owner),
        payload,
      });
      expect(response.statusCode).toBe(404);
    }
  });

  it('enforces guest read-only access and hides tenant/deletion state', async () => {
    const owner = await signUp('owner@example.com');
    const guest = await signUp('guest@example.com');
    const outsider = await signUp('outsider@example.com');
    const workspace = await createWorkspace(owner, 'task-rbac-team');
    await addMember(owner, workspace.id, guest, 'GUEST');
    const task = await createTask(owner, workspace.id, 'Visible task');

    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${task.id}`,
      headers: bearer(guest),
    });
    expect(read.statusCode).toBe(200);

    for (const request of [
      {
        method: 'POST' as const,
        url: `/api/v1/workspaces/${workspace.id}/tasks`,
        payload: { title: 'Forbidden' },
      },
      {
        method: 'PATCH' as const,
        url: `/api/v1/tasks/${task.id}`,
        payload: { title: 'Forbidden' },
      },
      {
        method: 'POST' as const,
        url: `/api/v1/tasks/${task.id}/complete`,
      },
      {
        method: 'DELETE' as const,
        url: `/api/v1/tasks/${task.id}`,
      },
    ]) {
      const response = await app.inject({ ...request, headers: bearer(guest) });
      expect(response.statusCode).toBe(403);
    }

    const foreign = await app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${task.id}`,
      headers: bearer(outsider),
    });
    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks/tsk_01J8A4ZS9VBD8XAADETY7SKHMA',
      headers: bearer(outsider),
    });
    expect(foreign.statusCode).toBe(403);
    expect(missing.statusCode).toBe(403);
    expect(foreign.json<ErrorEnvelope>().error).toEqual(
      missing.json<ErrorEnvelope>().error,
    );

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${task.id}`,
      headers: bearer(owner),
    });
    expect(deleted.statusCode).toBe(204);
    const hidden = await app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${task.id}`,
      headers: bearer(owner),
    });
    expect(hidden.statusCode).toBe(403);
  });
});
