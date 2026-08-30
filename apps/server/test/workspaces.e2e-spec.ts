import { Test, type TestingModule } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import {
  configureApplication,
  createFastifyAdapter,
} from '../src/application.factory';
import { AUTH_REPOSITORY } from '../src/modules/iam/application/ports/auth-repository.port';
import { MAGIC_LINK_SENDER } from '../src/modules/iam/application/ports/magic-link-sender.port';
import { WORKSPACE_REPOSITORY } from '../src/modules/iam/application/ports/workspace-repository.port';
import { InMemoryAuthRepository } from './helpers/in-memory-auth.repository';
import { InMemoryWorkspaceRepository } from './helpers/in-memory-workspace.repository';
import { RecordingMagicLinkSender } from './helpers/recording-magic-link.sender';

interface ResponseEnvelope<T> {
  data: T;
  meta: { requestId: string; timestamp: string };
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
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface MemberResponse {
  id: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
  email: string;
  fullName: string;
}

describe('Workspace and RBAC API (e2e)', () => {
  let app: NestFastifyApplication;
  let authRepository: InMemoryAuthRepository;
  let workspaceRepository: InMemoryWorkspaceRepository;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.JWT_ACCESS_SECRET =
      'test-access-secret-that-is-at-least-32-characters';
    authRepository = new InMemoryAuthRepository();
    workspaceRepository = new InMemoryWorkspaceRepository(authRepository);

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(authRepository)
      .overrideProvider(WORKSPACE_REPOSITORY)
      .useValue(workspaceRepository)
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
  });

  afterAll(async () => {
    await app.close();
  });

  const signUp = async (
    email: string,
    fullName: string,
  ): Promise<SessionResponse> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { email, fullName, password: 'a secure passphrase' },
    });
    expect(response.statusCode).toBe(201);
    return response.json<ResponseEnvelope<SessionResponse>>().data;
  };

  const bearer = (session: SessionResponse): Record<string, string> => ({
    authorization: `Bearer ${session.accessToken}`,
  });

  const createWorkspace = async (
    session: SessionResponse,
    slug = 'platform-team',
  ): Promise<WorkspaceResponse> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: bearer(session),
      payload: { name: 'Platform Team', slug },
    });
    expect(response.statusCode).toBe(201);
    return response.json<ResponseEnvelope<WorkspaceResponse>>().data;
  };

  const listMembers = async (
    session: SessionResponse,
    workspaceId: string,
  ): Promise<MemberResponse[]> => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: bearer(session),
    });
    expect(response.statusCode).toBe(200);
    return response.json<ResponseEnvelope<MemberResponse[]>>().data;
  };

  it('creates, lists, and gets an active workspace with its creator as owner', async () => {
    const owner = await signUp('owner@example.com', 'Workspace Owner');
    const workspace = await createWorkspace(owner, 'Platform-Team');

    expect(workspace).toMatchObject({
      name: 'Platform Team',
      slug: 'platform-team',
      settings: {},
    });
    expect(workspace.id).toMatch(/^ws_/);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces',
      headers: bearer(owner),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json<ResponseEnvelope<WorkspaceResponse[]>>().data).toEqual([
      workspace,
    ]);

    const found = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}`,
      headers: bearer(owner),
    });
    expect(found.statusCode).toBe(200);
    expect(found.json<ResponseEnvelope<WorkspaceResponse>>().data).toEqual(
      workspace,
    );

    const [creator] = await listMembers(owner, workspace.id);
    expect(creator).toMatchObject({
      userId: owner.user.id,
      email: owner.user.email,
      role: 'OWNER',
    });
    expect(creator?.id).toMatch(/^mbr_/);

    const memberDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/members/${creator?.id}`,
      headers: bearer(owner),
    });
    expect(memberDetail.statusCode).toBe(200);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: bearer(owner),
      payload: { name: 'Duplicate', slug: workspace.slug },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json<ErrorEnvelope>().error.code).toBe(
      'RESOURCE_CONFLICT',
    );

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: bearer(owner),
      payload: { name: 'Invalid', slug: 'invalid slug' },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('hides tenant existence and adds only existing, unique accounts', async () => {
    const owner = await signUp('owner@example.com', 'Workspace Owner');
    const outsider = await signUp('outsider@example.com', 'Outside User');
    const workspace = await createWorkspace(owner);

    for (const url of [
      `/api/v1/workspaces/${workspace.id}`,
      `/api/v1/workspaces/${workspace.id}/members`,
      '/api/v1/workspaces/ws_missing',
    ]) {
      const forbidden = await app.inject({
        method: 'GET',
        url,
        headers: bearer(outsider),
      });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json<ErrorEnvelope>().error.code).toBe('FORBIDDEN');
    }

    const missing = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspace.id}/members`,
      headers: bearer(owner),
      payload: { email: 'missing@example.com', role: 'MEMBER' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json<ErrorEnvelope>().error.code).toBe('RESOURCE_NOT_FOUND');

    const invited = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspace.id}/members`,
      headers: bearer(owner),
      payload: { email: '  OUTSIDER@example.com ', role: 'MEMBER' },
    });
    expect(invited.statusCode).toBe(201);
    expect(invited.json<ResponseEnvelope<MemberResponse>>().data).toMatchObject(
      { email: outsider.user.email, role: 'MEMBER' },
    );

    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspace.id}/members`,
      headers: bearer(owner),
      payload: { email: outsider.user.email, role: 'GUEST' },
    });
    expect(duplicate.statusCode).toBe(409);

    const visible = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}`,
      headers: bearer(outsider),
    });
    expect(visible.statusCode).toBe(200);

    const deniedUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${workspace.id}`,
      headers: bearer(outsider),
      payload: { name: 'Not Allowed' },
    });
    expect(deniedUpdate.statusCode).toBe(403);
  });

  it('enforces owner/admin member policy, preserves the last owner, and soft deletes', async () => {
    const owner = await signUp('owner@example.com', 'Workspace Owner');
    const admin = await signUp('admin@example.com', 'Workspace Admin');
    const peerAdmin = await signUp('peer-admin@example.com', 'Peer Admin');
    const guest = await signUp('guest@example.com', 'Workspace Guest');
    const workspace = await createWorkspace(owner);

    const add = async (
      actor: SessionResponse,
      email: string,
      role: 'ADMIN' | 'MEMBER' | 'GUEST',
    ): Promise<MemberResponse> => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspace.id}/members`,
        headers: bearer(actor),
        payload: { email, role },
      });
      expect(response.statusCode).toBe(201);
      return response.json<ResponseEnvelope<MemberResponse>>().data;
    };

    const adminMember = await add(owner, admin.user.email, 'ADMIN');
    const peerAdminMember = await add(owner, peerAdmin.user.email, 'ADMIN');
    const [ownerMember] = await listMembers(owner, workspace.id);

    const cannotGrantOwner = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${workspace.id}/members/${peerAdminMember.id}`,
      headers: bearer(admin),
      payload: { role: 'OWNER' },
    });
    expect(cannotGrantOwner.statusCode).toBe(403);

    for (const request of [
      { method: 'PATCH' as const, memberId: ownerMember?.id, role: 'MEMBER' },
      {
        method: 'PATCH' as const,
        memberId: peerAdminMember.id,
        role: 'MEMBER',
      },
      { method: 'DELETE' as const, memberId: ownerMember?.id },
      { method: 'DELETE' as const, memberId: peerAdminMember.id },
    ]) {
      const response = await app.inject({
        method: request.method,
        url: `/api/v1/workspaces/${workspace.id}/members/${request.memberId}`,
        headers: bearer(admin),
        ...(request.method === 'PATCH'
          ? { payload: { role: request.role } }
          : {}),
      });
      expect(response.statusCode).toBe(403);
    }

    const guestMember = await add(admin, guest.user.email, 'GUEST');
    const promotedGuest = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${workspace.id}/members/${guestMember.id}`,
      headers: bearer(admin),
      payload: { role: 'MEMBER' },
    });
    expect(promotedGuest.statusCode).toBe(200);
    expect(
      promotedGuest.json<ResponseEnvelope<MemberResponse>>().data.role,
    ).toBe('MEMBER');

    const removedGuest = await app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${workspace.id}/members/${guestMember.id}`,
      headers: bearer(admin),
    });
    expect(removedGuest.statusCode).toBe(204);

    for (const method of ['PATCH', 'DELETE'] as const) {
      const lastOwner = await app.inject({
        method,
        url: `/api/v1/workspaces/${workspace.id}/members/${ownerMember?.id}`,
        headers: bearer(owner),
        ...(method === 'PATCH' ? { payload: { role: 'MEMBER' } } : {}),
      });
      expect(lastOwner.statusCode).toBe(409);
    }

    const secondOwner = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${workspace.id}/members/${adminMember.id}`,
      headers: bearer(owner),
      payload: { role: 'OWNER' },
    });
    expect(secondOwner.statusCode).toBe(200);

    const demotedOriginalOwner = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${workspace.id}/members/${ownerMember?.id}`,
      headers: bearer(owner),
      payload: { role: 'MEMBER' },
    });
    expect(demotedOriginalOwner.statusCode).toBe(200);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${workspace.id}`,
      headers: bearer(admin),
    });
    expect(deleted.statusCode).toBe(204);

    const hiddenAfterDelete = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}`,
      headers: bearer(admin),
    });
    expect(hiddenAfterDelete.statusCode).toBe(403);

    const listedAfterDelete = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces',
      headers: bearer(admin),
    });
    expect(
      listedAfterDelete.json<ResponseEnvelope<WorkspaceResponse[]>>().data,
    ).toEqual([]);
  });
});
