import { Test, type TestingModule } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import {
  configureApplication,
  createFastifyAdapter,
} from '../src/application.factory';
import { IdempotencyRepository } from '../src/common/idempotency/idempotency.repository';
import { COMPANIES_REPOSITORY } from '../src/modules/companies/application/ports/companies-repository.port';
import { CONTACTS_REPOSITORY } from '../src/modules/contacts/application/ports/contacts-repository.port';
import { AUTH_REPOSITORY } from '../src/modules/iam/application/ports/auth-repository.port';
import { MAGIC_LINK_SENDER } from '../src/modules/iam/application/ports/magic-link-sender.port';
import { WORKSPACE_REPOSITORY } from '../src/modules/iam/application/ports/workspace-repository.port';
import { InMemoryAuthRepository } from './helpers/in-memory-auth.repository';
import { InMemoryCompaniesRepository } from './helpers/in-memory-companies.repository';
import { InMemoryContactsRepository } from './helpers/in-memory-contacts.repository';
import {
  idempotentBearer,
  InMemoryIdempotencyRepository,
} from './helpers/in-memory-idempotency.repository';
import { InMemoryWorkspaceRepository } from './helpers/in-memory-workspace.repository';
import { RecordingMagicLinkSender } from './helpers/recording-magic-link.sender';

interface ResponseEnvelope<T> {
  data: T;
  meta: { requestId: string; timestamp: string };
}

interface CursorEnvelope<T> {
  data: T[];
  meta: {
    requestId: string;
    timestamp: string;
    cursor: string | null;
    nextCursor: string | null;
    hasNext: boolean;
    limit: number;
    total: number;
  };
}

interface ErrorEnvelope {
  error: { code: string; message: string; details: unknown };
  meta: { requestId: string; timestamp: string };
}

interface SessionResponse {
  user: { id: string; email: string; fullName: string };
  accessToken: string;
}

interface WorkspaceResponse {
  id: string;
}

interface ContactResponse {
  id: string;
  workspaceId: string;
  companyId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  status: 'LEAD';
  attributes: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

describe('Contacts API (e2e)', () => {
  let app: NestFastifyApplication;
  let authRepository: InMemoryAuthRepository;
  let workspaceRepository: InMemoryWorkspaceRepository;
  let contactsRepository: InMemoryContactsRepository;
  let companiesRepository: InMemoryCompaniesRepository;
  let idempotencyRepository: InMemoryIdempotencyRepository;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.JWT_ACCESS_SECRET =
      'test-access-secret-that-is-at-least-32-characters';
    authRepository = new InMemoryAuthRepository();
    workspaceRepository = new InMemoryWorkspaceRepository(authRepository);
    contactsRepository = new InMemoryContactsRepository(workspaceRepository);
    companiesRepository = new InMemoryCompaniesRepository(workspaceRepository);
    idempotencyRepository = new InMemoryIdempotencyRepository();
    contactsRepository.setCompanyValidator((workspaceId, companyId) =>
      companiesRepository.isActiveInWorkspace(workspaceId, companyId),
    );

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(authRepository)
      .overrideProvider(WORKSPACE_REPOSITORY)
      .useValue(workspaceRepository)
      .overrideProvider(CONTACTS_REPOSITORY)
      .useValue(contactsRepository)
      .overrideProvider(COMPANIES_REPOSITORY)
      .useValue(companiesRepository)
      .overrideProvider(IdempotencyRepository)
      .useValue(idempotencyRepository)
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
    authRepository.reset();
    workspaceRepository.reset();
    contactsRepository.reset();
    companiesRepository.reset();
    idempotencyRepository.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  const signUp = async (email: string): Promise<SessionResponse> => {
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
    return response.json<ResponseEnvelope<SessionResponse>>().data;
  };

  const bearer = (session: SessionResponse): Record<string, string> => ({
    ...idempotentBearer(session.accessToken),
  });

  const createWorkspace = async (
    session: SessionResponse,
    slug = 'contacts-team',
  ): Promise<WorkspaceResponse> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: bearer(session),
      payload: { name: 'Contacts Team', slug },
    });
    expect(response.statusCode).toBe(201);
    return response.json<ResponseEnvelope<WorkspaceResponse>>().data;
  };

  const createContact = async (
    session: SessionResponse,
    workspaceId: string,
    email: string,
    extra: Record<string, unknown> = {},
  ): Promise<ContactResponse> => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/contacts`,
      headers: bearer(session),
      payload: { email, ...extra },
    });
    expect(response.statusCode).toBe(201);
    return response.json<ResponseEnvelope<ContactResponse>>().data;
  };

  it('creates, gets, finds, updates, and validates a normalized contact', async () => {
    const owner = await signUp('owner@example.com');
    const workspace = await createWorkspace(owner);
    const companyResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspace.id}/companies`,
      headers: bearer(owner),
      payload: { name: 'Analytical Engines' },
    });
    expect(companyResponse.statusCode).toBe(201);
    const companyId =
      companyResponse.json<ResponseEnvelope<{ id: string }>>().data.id;
    const contact = await createContact(
      owner,
      workspace.id,
      '  ADA@Example.COM ',
      {
        firstName: ' Ada ',
        companyId,
        attributes: { source: 'inbound' },
      },
    );

    expect(contact).toMatchObject({
      workspaceId: workspace.id,
      email: 'ada@example.com',
      firstName: 'Ada',
      companyId,
      status: 'LEAD',
      attributes: { source: 'inbound' },
      deletedAt: null,
    });
    expect(contact.id).toMatch(/^con_[0-9A-HJKMNP-TV-Z]{26}$/);

    const found = await app.inject({
      method: 'GET',
      url: `/api/v1/contacts/${contact.id}`,
      headers: bearer(owner),
    });
    expect(found.statusCode).toBe(200);
    expect(found.json<ResponseEnvelope<ContactResponse>>().data).toEqual(
      contact,
    );

    const byEmail = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/contacts/by-email/ADA%40EXAMPLE.COM`,
      headers: bearer(owner),
    });
    expect(byEmail.statusCode).toBe(200);
    expect(byEmail.json<ResponseEnvelope<ContactResponse>>().data.id).toBe(
      contact.id,
    );

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/contacts/${contact.id}`,
      headers: bearer(owner),
      payload: { lastName: ' Lovelace ', phone: ' +855 12 345 678 ' },
    });
    expect(updated.statusCode).toBe(200);
    expect(
      updated.json<ResponseEnvelope<ContactResponse>>().data,
    ).toMatchObject({ lastName: 'Lovelace', phone: '+855 12 345 678' });

    const invalidStatus = await app.inject({
      method: 'PATCH',
      url: `/api/v1/contacts/${contact.id}`,
      headers: bearer(owner),
      payload: { status: 'CUSTOMER' },
    });
    expect(invalidStatus.statusCode).toBe(400);
    expect(invalidStatus.json<ErrorEnvelope>().error.code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('returns stable cursor pages and cursor validation metadata', async () => {
    const owner = await signUp('owner@example.com');
    const workspace = await createWorkspace(owner);
    for (const email of [
      'one@example.com',
      'two@example.com',
      'three@example.com',
    ]) {
      await createContact(owner, workspace.id, email);
    }

    const first = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/contacts?limit=2`,
      headers: bearer(owner),
    });
    expect(first.statusCode).toBe(200);
    const firstPage = first.json<CursorEnvelope<ContactResponse>>();
    expect(firstPage.data).toHaveLength(2);
    expect(firstPage.meta).toMatchObject({
      cursor: null,
      hasNext: true,
      limit: 2,
      total: 3,
    });
    expect(firstPage.meta.nextCursor).toEqual(expect.any(String));

    const second = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/contacts?limit=2&cursor=${firstPage.meta.nextCursor}`,
      headers: bearer(owner),
    });
    expect(second.statusCode).toBe(200);
    const secondPage = second.json<CursorEnvelope<ContactResponse>>();
    expect(secondPage.data).toHaveLength(1);
    expect(secondPage.meta).toMatchObject({
      cursor: firstPage.meta.nextCursor,
      nextCursor: null,
      hasNext: false,
      limit: 2,
      total: 3,
    });
    expect(
      new Set([...firstPage.data, ...secondPage.data].map(({ id }) => id)).size,
    ).toBe(3);

    const invalid = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/contacts?cursor=not-a-cursor`,
      headers: bearer(owner),
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json<ErrorEnvelope>().error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ field: 'cursor' }],
    });
  });

  it('reports duplicate merge details and permits recreation after soft delete', async () => {
    const owner = await signUp('owner@example.com');
    const workspace = await createWorkspace(owner);
    const existing = await createContact(
      owner,
      workspace.id,
      'lead@example.com',
    );

    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspace.id}/contacts`,
      headers: bearer(owner),
      payload: { email: 'LEAD@example.com' },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json<ErrorEnvelope>().error).toMatchObject({
      code: 'RESOURCE_CONFLICT',
      details: {
        field: 'email',
        existingContactId: existing.id,
        recommendation: 'Merge with the existing contact.',
      },
    });

    const other = await createContact(owner, workspace.id, 'other@example.com');
    const updateConflict = await app.inject({
      method: 'PATCH',
      url: `/api/v1/contacts/${other.id}`,
      headers: bearer(owner),
      payload: { email: existing.email },
    });
    expect(updateConflict.statusCode).toBe(409);
    expect(
      (
        updateConflict.json<ErrorEnvelope>().error.details as {
          existingContactId: string;
        }
      ).existingContactId,
    ).toBe(existing.id);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/contacts/${existing.id}`,
      headers: bearer(owner),
    });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');

    const deletedResource = await app.inject({
      method: 'GET',
      url: `/api/v1/contacts/${existing.id}`,
      headers: bearer(owner),
    });
    expect(deletedResource.statusCode).toBe(403);
    expect(deletedResource.json<ErrorEnvelope>().error).toMatchObject({
      code: 'FORBIDDEN',
      message: 'You do not have access to this contact.',
    });

    const byEmail = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/contacts/by-email/${existing.email}`,
      headers: bearer(owner),
    });
    expect(byEmail.statusCode).toBe(404);

    const recreated = await createContact(owner, workspace.id, existing.email);
    expect(recreated.id).not.toBe(existing.id);
  });

  it('hides tenant existence and keeps guests read-only', async () => {
    const owner = await signUp('owner@example.com');
    const outsider = await signUp('outsider@example.com');
    const guest = await signUp('guest@example.com');
    const workspace = await createWorkspace(owner);
    const contact = await createContact(
      owner,
      workspace.id,
      'lead@example.com',
    );

    const addGuest = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspace.id}/members`,
      headers: bearer(owner),
      payload: { email: guest.user.email, role: 'GUEST' },
    });
    expect(addGuest.statusCode).toBe(201);

    for (const id of [contact.id, 'con_01J8A4WS9VBD8XAADETY7SKHMA']) {
      const forbidden = await app.inject({
        method: 'GET',
        url: `/api/v1/contacts/${id}`,
        headers: bearer(outsider),
      });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json<ErrorEnvelope>().error).toMatchObject({
        code: 'FORBIDDEN',
        message: 'You do not have access to this contact.',
      });
    }

    const guestRead = await app.inject({
      method: 'GET',
      url: `/api/v1/contacts/${contact.id}`,
      headers: bearer(guest),
    });
    expect(guestRead.statusCode).toBe(200);

    const guestList = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/contacts`,
      headers: bearer(guest),
    });
    expect(guestList.statusCode).toBe(200);

    for (const request of [
      {
        method: 'POST' as const,
        url: `/api/v1/workspaces/${workspace.id}/contacts`,
        payload: { email: 'blocked@example.com' },
      },
      {
        method: 'PATCH' as const,
        url: `/api/v1/contacts/${contact.id}`,
        payload: { firstName: 'Blocked' },
      },
      {
        method: 'DELETE' as const,
        url: `/api/v1/contacts/${contact.id}`,
      },
    ]) {
      const forbidden = await app.inject({
        ...request,
        headers: bearer(guest),
      });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json<ErrorEnvelope>().error.code).toBe('FORBIDDEN');
    }
  });
});
