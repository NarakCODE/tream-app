import { createApiClient } from '@repo/api-client';
import { describe, expect, it, vi } from 'vitest';
import { workspacesApi } from './api';

const workspace = {
   id: 'workspace-1',
   name: 'Northstar',
   slug: 'northstar',
   settings: {},
   createdAt: '2026-10-05T20:00:00.000Z',
   updatedAt: '2026-10-05T20:00:00.000Z',
   archivedAt: null,
   deletedAt: null,
   purgedAt: null,
};

const membership = {
   id: 'membership-1',
   workspaceId: workspace.id,
   userId: 'user-1',
   role: 'OWNER' as const,
   state: 'ACTIVE' as const,
   createdAt: '2026-10-05T20:00:00.000Z',
   updatedAt: '2026-10-05T20:00:00.000Z',
};

const invitation = {
   id: 'invitation-1',
   workspaceId: workspace.id,
   email: 'member@example.com',
   role: 'MEMBER' as const,
   invitedBy: membership.id,
   acceptedBy: null,
   expiresAt: '2026-10-12T20:00:00.000Z',
   acceptedAt: null,
   revokedAt: null,
   createdAt: '2026-10-05T20:00:00.000Z',
};

const pageMeta = {
   cursor: null,
   nextCursor: null,
   hasNext: false,
   limit: 50,
   total: 1,
};

function setup() {
   const fetchFn = vi.fn<typeof fetch>();
   const api = createApiClient({ baseUrl: 'http://localhost:3002', fetchFn });
   return { api, fetchFn };
}

function respond(fetchFn: ReturnType<typeof vi.fn<typeof fetch>>, data: unknown, meta = {}) {
   fetchFn.mockResolvedValueOnce(
      new Response(JSON.stringify({ data, meta }), {
         status: 200,
         headers: { 'Content-Type': 'application/json' },
      })
   );
}

function expectCommand(
   fetchFn: ReturnType<typeof vi.fn<typeof fetch>>,
   index: number,
   key: string
) {
   const options = fetchFn.mock.calls[index]?.[1];
   expect(new Headers(options?.headers).get('Idempotency-Key')).toBe(key);
}

describe('workspace API contract', () => {
   it('lists and retrieves workspaces with the documented routes and cursor envelope', async () => {
      const { api, fetchFn } = setup();
      respond(fetchFn, [workspace], { ...pageMeta, nextCursor: 'cursor-next', hasNext: true });
      respond(fetchFn, null);
      respond(fetchFn, workspace);

      const page = await workspacesApi.list(api, {
         limit: 25,
         cursor: 'cursor/previous',
         cache: 'no-store',
      });
      expect(page.data).toEqual([workspace]);
      expect(page.meta.nextCursor).toBe('cursor-next');
      expect(fetchFn.mock.calls[0]?.[0]).toBe(
         'http://localhost:3002/api/v1/workspaces?limit=25&cursor=cursor%2Fprevious'
      );
      expect(fetchFn.mock.calls[0]?.[1]?.cache).toBe('no-store');

      expect(await workspacesApi.active(api)).toBeNull();
      expect(fetchFn.mock.calls[1]?.[0]).toBe('http://localhost:3002/api/v1/workspaces/active');
      expect(await workspacesApi.get(api, 'workspace/1')).toEqual(workspace);
      expect(fetchFn.mock.calls[2]?.[0]).toBe(
         'http://localhost:3002/api/v1/workspaces/workspace%2F1'
      );
   });

   it('creates, updates, deletes, selects, and leaves workspaces idempotently', async () => {
      const { api, fetchFn } = setup();
      respond(fetchFn, workspace);
      respond(fetchFn, { ...workspace, archivedAt: '2026-10-06T20:00:00.000Z' });
      respond(fetchFn, { id: workspace.id, deleted: true });
      respond(fetchFn, { workspaceId: workspace.id });
      respond(fetchFn, { ...membership, state: 'LEFT' });

      await workspacesApi.create(api, { name: ' Northstar ', slug: 'northstar' }, 'key-create');
      await workspacesApi.update(api, workspace.id, { lifecycle: 'archive' }, 'key-update');
      await workspacesApi.remove(api, workspace.id, 'key-delete');
      await workspacesApi.select(api, workspace.id, 'key-select');
      await workspacesApi.leave(api, workspace.id, 'key-leave');

      expect(fetchFn.mock.calls.map(([url, options]) => [url, options?.method])).toEqual([
         ['http://localhost:3002/api/v1/workspaces', 'POST'],
         [`http://localhost:3002/api/v1/workspaces/${workspace.id}`, 'PATCH'],
         [`http://localhost:3002/api/v1/workspaces/${workspace.id}`, 'DELETE'],
         [`http://localhost:3002/api/v1/workspaces/${workspace.id}/select`, 'POST'],
         [`http://localhost:3002/api/v1/workspaces/${workspace.id}/leave`, 'POST'],
      ]);
      ['key-create', 'key-update', 'key-delete', 'key-select', 'key-leave'].forEach((key, index) =>
         expectCommand(fetchFn, index, key)
      );
      expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
         name: 'Northstar',
         slug: 'northstar',
      });
   });

   it('reads and updates the workspace roster', async () => {
      const { api, fetchFn } = setup();
      respond(fetchFn, [membership], pageMeta);
      respond(fetchFn, { ...membership, role: 'ADMIN' });
      respond(fetchFn, { ...membership, state: 'LEFT' });

      const page = await workspacesApi.members(api, workspace.id, { cursor: 'member-cursor' });
      expect(page.data).toEqual([membership]);
      expect(fetchFn.mock.calls[0]?.[0]).toBe(
         `http://localhost:3002/api/v1/workspaces/${workspace.id}/members?limit=50&cursor=member-cursor`
      );
      await workspacesApi.updateMember(
         api,
         workspace.id,
         'member/1',
         { role: 'ADMIN' },
         'key-member-update'
      );
      await workspacesApi.removeMember(api, workspace.id, 'member/1', 'key-member-remove');

      expect(fetchFn.mock.calls[1]?.[0]).toBe(
         `http://localhost:3002/api/v1/workspaces/${workspace.id}/members/member%2F1`
      );
      expect(fetchFn.mock.calls[1]?.[1]?.method).toBe('PATCH');
      expect(JSON.parse(String(fetchFn.mock.calls[1]?.[1]?.body))).toEqual({ role: 'ADMIN' });
      expect(fetchFn.mock.calls[2]?.[1]?.method).toBe('DELETE');
      expectCommand(fetchFn, 1, 'key-member-update');
      expectCommand(fetchFn, 2, 'key-member-remove');
   });

   it('lists, creates, accepts, and revokes invitations', async () => {
      const { api, fetchFn } = setup();
      respond(fetchFn, [invitation], pageMeta);
      respond(fetchFn, { ...invitation, role: 'GUEST' });
      respond(fetchFn, membership);
      respond(fetchFn, { ...invitation, revokedAt: '2026-10-06T20:00:00.000Z' });

      await workspacesApi.invitations(api, workspace.id, { cursor: 'invite-cursor' });
      expect(fetchFn.mock.calls[0]?.[0]).toBe(
         `http://localhost:3002/api/v1/workspaces/${workspace.id}/invitations?limit=50&cursor=invite-cursor`
      );
      await workspacesApi.invite(
         api,
         workspace.id,
         { email: '  Guest@Example.com ', role: 'GUEST' },
         'key-invite'
      );
      expect(JSON.parse(String(fetchFn.mock.calls[1]?.[1]?.body))).toEqual({
         email: 'guest@example.com',
         role: 'GUEST',
      });
      expectCommand(fetchFn, 1, 'key-invite');

      await workspacesApi.acceptInvitation(api, 'a'.repeat(43), 'key-accept');
      await workspacesApi.revokeInvitation(api, workspace.id, 'invite/1', 'key-revoke');
      expect(fetchFn.mock.calls[2]?.[0]).toBe(
         'http://localhost:3002/api/v1/workspaces/invitations/accept'
      );
      expect(fetchFn.mock.calls[3]?.[0]).toBe(
         `http://localhost:3002/api/v1/workspaces/${workspace.id}/invitations/invite%2F1`
      );
      expect(fetchFn.mock.calls[3]?.[1]?.method).toBe('DELETE');
      expectCommand(fetchFn, 2, 'key-accept');
      expectCommand(fetchFn, 3, 'key-revoke');
   });

   it('reads and updates member preferences with validated timezone values', async () => {
      const { api, fetchFn } = setup();
      respond(fetchFn, { theme: 'system', timezone: 'UTC' });
      respond(fetchFn, { theme: 'dark', timezone: 'Asia/Phnom_Penh' });

      expect(await workspacesApi.preferences(api, workspace.id)).toEqual({
         theme: 'system',
         timezone: 'UTC',
      });
      expect(fetchFn.mock.calls[0]?.[0]).toBe(
         `http://localhost:3002/api/v1/workspaces/${workspace.id}/preferences`
      );
      await workspacesApi.updatePreferences(
         api,
         workspace.id,
         { theme: 'dark', timezone: 'Asia/Phnom_Penh' },
         'key-preferences'
      );
      expect(fetchFn.mock.calls[1]?.[1]?.method).toBe('PATCH');
      expectCommand(fetchFn, 1, 'key-preferences');
      await expect(
         workspacesApi.updatePreferences(
            api,
            workspace.id,
            {
               theme: 'dark',
               timezone: 'not/a-zone',
            },
            'key-invalid'
         )
      ).rejects.toThrow('Use a valid IANA timezone');
      expect(fetchFn).toHaveBeenCalledTimes(2);
   });
});
