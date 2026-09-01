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
  meta: { requestId: string; timestamp: string };
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

interface DealResponse {
  id: string;
  workspaceId: string;
  companyId: string | null;
  title: string;
  amount: string;
  currency: string;
  stage: 'DISCOVERY';
  closeDate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

describe('Deals API (e2e)', () => {
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

  const createCompany = async (session: Session, workspaceId: string) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/companies`,
      headers: bearer(session),
      payload: { name: 'Analytical Engines' },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<{ id: string }>>().data;
  };

  const createContact = async (
    session: Session,
    workspaceId: string,
    email: string,
  ) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/contacts`,
      headers: bearer(session),
      payload: { email },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<{ id: string }>>().data;
  };

  const createDeal = async (
    session: Session,
    workspaceId: string,
    title: string,
    extra: Record<string, unknown> = {},
  ): Promise<DealResponse> => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/deals`,
      headers: bearer(session),
      payload: { title, ...extra },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<DealResponse>>().data;
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

  it('creates, normalizes, reads, updates, filters, and cursor-paginates deals', async () => {
    const owner = await signUp('owner@example.com');
    const workspace = await createWorkspace(owner, 'deal-team');
    const company = await createCompany(owner, workspace.id);
    const firstDeal = await createDeal(owner, workspace.id, 'First', {
      companyId: company.id,
      amount: '12.5',
      currency: 'usd',
      closeDate: '2027-01-01T00:00:00.000Z',
    });
    await createDeal(owner, workspace.id, 'Second');
    await createDeal(owner, workspace.id, 'Third');

    expect(firstDeal).toMatchObject({
      workspaceId: workspace.id,
      companyId: company.id,
      amount: '12.50',
      currency: 'USD',
      stage: 'DISCOVERY',
    });
    expect(firstDeal.id).toMatch(/^del_[0-9A-HJKMNP-TV-Z]{26}$/);

    const pageOneResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/deals?limit=2`,
      headers: bearer(owner),
    });
    expect(pageOneResponse.statusCode).toBe(200);
    const pageOne = pageOneResponse.json<CursorEnvelope<DealResponse>>();
    expect(pageOne.data).toHaveLength(2);
    expect(pageOne.meta).toMatchObject({
      cursor: null,
      hasNext: true,
      limit: 2,
      total: 3,
    });
    expect(pageOne.meta.nextCursor).toBeTruthy();

    const pageTwo = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/deals?limit=2&cursor=${pageOne.meta.nextCursor}`,
      headers: bearer(owner),
    });
    expect(pageTwo.json<CursorEnvelope<DealResponse>>().data).toHaveLength(1);

    const companyDeals = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${company.id}/deals`,
      headers: bearer(owner),
    });
    expect(companyDeals.statusCode).toBe(200);
    expect(companyDeals.json<CursorEnvelope<DealResponse>>().data).toEqual([
      firstDeal,
    ]);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/deals/${firstDeal.id}`,
      headers: bearer(owner),
      payload: { title: 'Renewal', amount: '100' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<Envelope<DealResponse>>().data).toMatchObject({
      title: 'Renewal',
      amount: '100.00',
    });

    const invalid = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspace.id}/deals`,
      headers: bearer(owner),
      payload: { title: 'Invalid', amount: '-1', stage: 'WON' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json<ErrorEnvelope>().error.code).toBe('VALIDATION_ERROR');
  });

  it('validates tenant-scoped company references', async () => {
    const owner = await signUp('owner@example.com');
    const first = await createWorkspace(owner, 'first-deal-team');
    const second = await createWorkspace(owner, 'second-deal-team');
    const foreignCompany = await createCompany(owner, second.id);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${first.id}/deals`,
      headers: bearer(owner),
      payload: { title: 'Cross tenant', companyId: foreignCompany.id },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorEnvelope>().error.code).toBe(
      'RESOURCE_NOT_FOUND',
    );
  });

  it('adds, lists, rejects duplicates, and removes deal contacts', async () => {
    const owner = await signUp('owner@example.com');
    const workspace = await createWorkspace(owner, 'deal-contact-team');
    const other = await createWorkspace(owner, 'foreign-contact-team');
    const deal = await createDeal(owner, workspace.id, 'Contact deal');
    const contact = await createContact(owner, workspace.id, 'ada@example.com');
    const foreign = await createContact(owner, other.id, 'grace@example.com');

    const added = await app.inject({
      method: 'POST',
      url: `/api/v1/deals/${deal.id}/contacts`,
      headers: bearer(owner),
      payload: { contactId: contact.id },
    });
    expect(added.statusCode).toBe(204);

    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/deals/${deal.id}/contacts`,
      headers: bearer(owner),
      payload: { contactId: contact.id },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json<ErrorEnvelope>().error.code).toBe(
      'RESOURCE_CONFLICT',
    );

    const invalid = await app.inject({
      method: 'POST',
      url: `/api/v1/deals/${deal.id}/contacts`,
      headers: bearer(owner),
      payload: { contactId: foreign.id },
    });
    expect(invalid.statusCode).toBe(404);

    const listed = await app.inject({
      method: 'GET',
      url: `/api/v1/deals/${deal.id}/contacts`,
      headers: bearer(owner),
    });
    expect(listed.json<CursorEnvelope<{ id: string }>>().data).toEqual([
      expect.objectContaining({ id: contact.id }),
    ]);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/deals/${deal.id}/contacts/${contact.id}`,
      headers: bearer(owner),
    });
    expect(removed.statusCode).toBe(204);
  });

  it('enforces guest read-only access and hides tenant/deletion state', async () => {
    const owner = await signUp('owner@example.com');
    const guest = await signUp('guest@example.com');
    const outsider = await signUp('outsider@example.com');
    const workspace = await createWorkspace(owner, 'deal-rbac-team');
    await addMember(owner, workspace.id, guest, 'GUEST');
    const deal = await createDeal(owner, workspace.id, 'Visible');

    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/deals/${deal.id}`,
      headers: bearer(guest),
    });
    expect(read.statusCode).toBe(200);

    for (const request of [
      {
        method: 'POST' as const,
        url: `/api/v1/workspaces/${workspace.id}/deals`,
        payload: { title: 'Forbidden' },
      },
      {
        method: 'PATCH' as const,
        url: `/api/v1/deals/${deal.id}`,
        payload: { title: 'Forbidden' },
      },
      {
        method: 'DELETE' as const,
        url: `/api/v1/deals/${deal.id}`,
      },
    ]) {
      const response = await app.inject({ ...request, headers: bearer(guest) });
      expect(response.statusCode).toBe(403);
    }

    const foreign = await app.inject({
      method: 'GET',
      url: `/api/v1/deals/${deal.id}`,
      headers: bearer(outsider),
    });
    expect(foreign.statusCode).toBe(403);
    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/deals/del_01J8A4ZS9VBD8XAADETY7SKHMA',
      headers: bearer(outsider),
    });
    expect(missing.statusCode).toBe(403);
    expect(foreign.json<ErrorEnvelope>().error).toEqual(
      missing.json<ErrorEnvelope>().error,
    );

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/deals/${deal.id}`,
      headers: bearer(owner),
    });
    expect(deleted.statusCode).toBe(204);
    const hidden = await app.inject({
      method: 'GET',
      url: `/api/v1/deals/${deal.id}`,
      headers: bearer(owner),
    });
    expect(hidden.statusCode).toBe(403);
  });
});
