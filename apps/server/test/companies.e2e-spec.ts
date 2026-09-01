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
  user: { id: string; email: string };
  accessToken: string;
}

interface WorkspaceResponse {
  id: string;
}

interface CompanyResponse {
  id: string;
  workspaceId: string;
  name: string;
  domain: string | null;
  industry: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface ContactResponse {
  id: string;
  workspaceId: string;
  companyId: string | null;
  email: string;
}

describe('Companies API (e2e)', () => {
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
    slug = 'companies-team',
  ): Promise<WorkspaceResponse> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: bearer(session),
      payload: { name: 'Companies Team', slug },
    });
    expect(response.statusCode).toBe(201);
    return response.json<ResponseEnvelope<WorkspaceResponse>>().data;
  };

  const createCompany = async (
    session: SessionResponse,
    workspaceId: string,
    name: string,
    extra: Record<string, unknown> = {},
  ): Promise<CompanyResponse> => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/companies`,
      headers: bearer(session),
      payload: { name, ...extra },
    });
    expect(response.statusCode).toBe(201);
    return response.json<ResponseEnvelope<CompanyResponse>>().data;
  };

  const addMember = async (
    owner: SessionResponse,
    workspaceId: string,
    member: SessionResponse,
    role: 'ADMIN' | 'MEMBER' | 'GUEST',
  ): Promise<void> => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: bearer(owner),
      payload: { email: member.user.email, role },
    });
    expect(response.statusCode).toBe(201);
  };

  it('creates, gets, normalizes, validates, and updates a company', async () => {
    const owner = await signUp('owner@example.com');
    const workspace = await createWorkspace(owner);
    const company = await createCompany(owner, workspace.id, ' Acme Inc. ', {
      domain: ' Example.COM. ',
      industry: ' Software ',
    });

    expect(company).toMatchObject({
      workspaceId: workspace.id,
      name: 'Acme Inc.',
      domain: 'example.com',
      industry: 'Software',
      deletedAt: null,
    });
    expect(company.id).toMatch(/^cmp_[0-9A-HJKMNP-TV-Z]{26}$/);

    const found = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${company.id}`,
      headers: bearer(owner),
    });
    expect(found.statusCode).toBe(200);
    expect(found.json<ResponseEnvelope<CompanyResponse>>().data).toEqual(
      company,
    );

    const byDomain = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/companies/by-domain/EXAMPLE.COM.`,
      headers: bearer(owner),
    });
    expect(byDomain.statusCode).toBe(200);
    expect(byDomain.json<ResponseEnvelope<CompanyResponse>>().data.id).toBe(
      company.id,
    );

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/companies/${company.id}`,
      headers: bearer(owner),
      payload: { name: ' Acme Global ', domain: null, industry: null },
    });
    expect(updated.statusCode).toBe(200);
    expect(
      updated.json<ResponseEnvelope<CompanyResponse>>().data,
    ).toMatchObject({ name: 'Acme Global', domain: null, industry: null });

    for (const domain of ['https://example.com', '127.0.0.1', 'localhost']) {
      const invalid = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspace.id}/companies`,
        headers: bearer(owner),
        payload: { name: 'Invalid', domain },
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json<ErrorEnvelope>().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('paginates companies and preserves non-unique domain ambiguity', async () => {
    const owner = await signUp('owner@example.com');
    const workspace = await createWorkspace(owner);
    const matches = [
      await createCompany(owner, workspace.id, 'First', {
        domain: 'shared.example',
      }),
      await createCompany(owner, workspace.id, 'Second', {
        domain: 'shared.example',
      }),
    ];
    await createCompany(owner, workspace.id, 'Third', {
      domain: 'other.example',
    });

    const first = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/companies?limit=2`,
      headers: bearer(owner),
    });
    expect(first.statusCode).toBe(200);
    const firstPage = first.json<CursorEnvelope<CompanyResponse>>();
    expect(firstPage.data).toHaveLength(2);
    expect(firstPage.meta).toMatchObject({
      cursor: null,
      hasNext: true,
      limit: 2,
      total: 3,
    });

    const second = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/companies?limit=2&cursor=${firstPage.meta.nextCursor}`,
      headers: bearer(owner),
    });
    const secondPage = second.json<CursorEnvelope<CompanyResponse>>();
    expect(second.statusCode).toBe(200);
    expect(secondPage.data).toHaveLength(1);
    expect(secondPage.meta).toMatchObject({
      cursor: firstPage.meta.nextCursor,
      nextCursor: null,
      hasNext: false,
      total: 3,
    });

    const ambiguous = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/companies/by-domain/shared.example`,
      headers: bearer(owner),
    });
    expect(ambiguous.statusCode).toBe(409);
    expect(ambiguous.json<ErrorEnvelope>().error).toMatchObject({
      code: 'RESOURCE_CONFLICT',
      details: {
        domain: 'shared.example',
        matchingCompanyIds: matches.map(({ id }) => id).sort(),
      },
    });

    const deleteFirst = await app.inject({
      method: 'DELETE',
      url: `/api/v1/companies/${matches[0]?.id}`,
      headers: bearer(owner),
    });
    expect(deleteFirst.statusCode).toBe(204);
    const resolved = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/companies/by-domain/shared.example`,
      headers: bearer(owner),
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json<ResponseEnvelope<CompanyResponse>>().data.id).toBe(
      matches[1]?.id,
    );

    const missing = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/companies/by-domain/missing.example`,
      headers: bearer(owner),
    });
    expect(missing.statusCode).toBe(404);
  });

  it('lists assigned contacts and rejects missing, foreign, or deleted company assignments', async () => {
    const owner = await signUp('owner@example.com');
    const otherOwner = await signUp('other@example.com');
    const workspace = await createWorkspace(owner);
    const otherWorkspace = await createWorkspace(otherOwner, 'other-team');
    const company = await createCompany(owner, workspace.id, 'Acme');
    const otherCompany = await createCompany(
      otherOwner,
      otherWorkspace.id,
      'Other',
    );

    const contacts: ContactResponse[] = [];
    for (const email of [
      'one@example.com',
      'two@example.com',
      'three@example.com',
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspace.id}/contacts`,
        headers: bearer(owner),
        payload: { email, companyId: company.id },
      });
      expect(response.statusCode).toBe(201);
      contacts.push(response.json<ResponseEnvelope<ContactResponse>>().data);
    }
    await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspace.id}/contacts`,
      headers: bearer(owner),
      payload: { email: 'unassigned@example.com' },
    });

    const first = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${company.id}/contacts?limit=2`,
      headers: bearer(owner),
    });
    const firstPage = first.json<CursorEnvelope<ContactResponse>>();
    expect(first.statusCode).toBe(200);
    expect(firstPage.data).toHaveLength(2);
    expect(firstPage.meta).toMatchObject({ total: 3, hasNext: true, limit: 2 });

    const second = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${company.id}/contacts?limit=2&cursor=${firstPage.meta.nextCursor}`,
      headers: bearer(owner),
    });
    const secondPage = second.json<CursorEnvelope<ContactResponse>>();
    expect(second.statusCode).toBe(200);
    expect(secondPage.data).toHaveLength(1);
    expect(
      new Set([...firstPage.data, ...secondPage.data].map(({ id }) => id)),
    ).toEqual(new Set(contacts.map(({ id }) => id)));

    for (const invalidCompanyId of [
      'cmp_01J8A4XS9VBD8XAADETY7SKHMA',
      otherCompany.id,
    ]) {
      const invalid = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspace.id}/contacts`,
        headers: bearer(owner),
        payload: {
          email: `${invalidCompanyId.slice(-6).toLowerCase()}@example.com`,
          companyId: invalidCompanyId,
        },
      });
      expect(invalid.statusCode).toBe(404);
      expect(invalid.json<ErrorEnvelope>().error.code).toBe(
        'RESOURCE_NOT_FOUND',
      );
    }

    const foreignUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/v1/contacts/${contacts[0]?.id}`,
      headers: bearer(owner),
      payload: { companyId: otherCompany.id },
    });
    expect(foreignUpdate.statusCode).toBe(404);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/companies/${company.id}`,
      headers: bearer(owner),
    });
    expect(deleted.statusCode).toBe(204);

    const deletedAssignment = await app.inject({
      method: 'PATCH',
      url: `/api/v1/contacts/${contacts[0]?.id}`,
      headers: bearer(owner),
      payload: { companyId: company.id },
    });
    expect(deletedAssignment.statusCode).toBe(404);
  });

  it('returns indistinguishable forbidden responses for hidden company resources', async () => {
    const owner = await signUp('owner@example.com');
    const outsider = await signUp('outsider@example.com');
    const workspace = await createWorkspace(owner);
    const company = await createCompany(owner, workspace.id, 'Hidden');

    const foreign = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${company.id}`,
      headers: bearer(outsider),
    });
    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/companies/cmp_01J8A4XS9VBD8XAADETY7SKHMA',
      headers: bearer(owner),
    });
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/companies/${company.id}`,
      headers: bearer(owner),
    });
    const deleted = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${company.id}`,
      headers: bearer(owner),
    });

    const hidden = [foreign, missing, deleted].map(
      (response) => response.json<ErrorEnvelope>().error,
    );
    expect([
      foreign.statusCode,
      missing.statusCode,
      deleted.statusCode,
    ]).toEqual([403, 403, 403]);
    expect(hidden).toEqual([hidden[0], hidden[0], hidden[0]]);
  });

  it('allows every role to read, keeps guests read-only, and permits admin/member writes', async () => {
    const owner = await signUp('owner@example.com');
    const admin = await signUp('admin@example.com');
    const member = await signUp('member@example.com');
    const guest = await signUp('guest@example.com');
    const workspace = await createWorkspace(owner);
    const company = await createCompany(owner, workspace.id, 'Visible');
    await addMember(owner, workspace.id, admin, 'ADMIN');
    await addMember(owner, workspace.id, member, 'MEMBER');
    await addMember(owner, workspace.id, guest, 'GUEST');

    for (const session of [owner, admin, member, guest]) {
      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/companies/${company.id}`,
        headers: bearer(session),
      });
      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${workspace.id}/companies`,
        headers: bearer(session),
      });
      expect([detail.statusCode, list.statusCode]).toEqual([200, 200]);
    }

    for (const [session, name] of [
      [admin, 'Admin Company'],
      [member, 'Member Company'],
    ] as const) {
      const created = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspace.id}/companies`,
        headers: bearer(session),
        payload: { name },
      });
      expect(created.statusCode).toBe(201);
    }

    for (const request of [
      {
        method: 'POST' as const,
        url: `/api/v1/workspaces/${workspace.id}/companies`,
        payload: { name: 'Blocked' },
      },
      {
        method: 'PATCH' as const,
        url: `/api/v1/companies/${company.id}`,
        payload: { name: 'Blocked' },
      },
      {
        method: 'DELETE' as const,
        url: `/api/v1/companies/${company.id}`,
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
