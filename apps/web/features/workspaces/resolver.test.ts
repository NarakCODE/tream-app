import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Workspace } from '@repo/schemas';
import { authKeys } from '@/features/auth/queries';
import { resolveWorkspaceForRoute, workspaceBySlugKey } from './resolver';
import { workspacesApi } from './api';
import { workspaceKeys } from './queries';

vi.mock('@/lib/api', () => ({ api: {} }));
vi.mock('./api', () => ({
   workspacesApi: {
      active: vi.fn(),
      list: vi.fn(),
      get: vi.fn(),
   },
}));

const mockActiveWorkspace: Workspace = {
   id: '11111111-1111-1111-1111-111111111111',
   name: 'Active Org',
   slug: 'active-org',
   settings: {},
   createdAt: '2026-01-01T00:00:00Z',
   updatedAt: '2026-01-01T00:00:00Z',
   archivedAt: null,
   deletedAt: null,
   purgedAt: null,
};

const mockOtherWorkspace: Workspace = {
   id: '22222222-2222-2222-2222-222222222222',
   name: 'Other Org',
   slug: 'other-org',
   settings: {},
   createdAt: '2026-01-01T00:00:00Z',
   updatedAt: '2026-01-01T00:00:00Z',
   archivedAt: null,
   deletedAt: null,
   purgedAt: null,
};

describe('resolveWorkspaceForRoute', () => {
   let queryClient: QueryClient;
   const mockApi = {} as any;

   beforeEach(() => {
      queryClient = new QueryClient({
         defaultOptions: { queries: { retry: false } },
      });
      vi.clearAllMocks();
   });

   it('resolves immediately when route parameter matches active workspace slug', async () => {
      queryClient.setQueryData(authKeys.activeWorkspace(), {
         workspaceId: mockActiveWorkspace.id,
         workspace: mockActiveWorkspace,
      });

      const result = await resolveWorkspaceForRoute(mockApi, queryClient, 'active-org');

      expect(result).toEqual(mockActiveWorkspace);
      expect(workspacesApi.list).not.toHaveBeenCalled();
   });

   it('resolves immediately when route parameter matches active workspace UUID', async () => {
      queryClient.setQueryData(authKeys.activeWorkspace(), {
         workspaceId: mockActiveWorkspace.id,
         workspace: mockActiveWorkspace,
      });

      const result = await resolveWorkspaceForRoute(
         mockApi,
         queryClient,
         mockActiveWorkspace.id
      );

      expect(result).toEqual(mockActiveWorkspace);
      expect(workspacesApi.list).not.toHaveBeenCalled();
   });

   it('fetches by UUID directly when parameter is a valid UUID but not active', async () => {
      queryClient.setQueryData(authKeys.activeWorkspace(), {
         workspaceId: mockActiveWorkspace.id,
         workspace: mockActiveWorkspace,
      });

      vi.mocked(workspacesApi.get).mockResolvedValueOnce(mockOtherWorkspace);

      const result = await resolveWorkspaceForRoute(
         mockApi,
         queryClient,
         mockOtherWorkspace.id
      );

      expect(result).toEqual(mockOtherWorkspace);
   });

   it('falls back to paginated list search when resolving an unfamiliar slug', async () => {
      queryClient.setQueryData(authKeys.activeWorkspace(), {
         workspaceId: mockActiveWorkspace.id,
         workspace: mockActiveWorkspace,
      });

      vi.mocked(workspacesApi.list).mockResolvedValueOnce({
         data: [mockOtherWorkspace],
         meta: { hasNext: false, limit: 25 },
      } as any);

      const result = await resolveWorkspaceForRoute(mockApi, queryClient, 'other-org');

      expect(result).toEqual(mockOtherWorkspace);
      expect(workspacesApi.list).toHaveBeenCalledWith(
         mockApi,
         expect.objectContaining({ limit: 25 })
      );
      // Query cache should be primed
      expect(queryClient.getQueryData(workspaceKeys.detail(mockOtherWorkspace.id))).toEqual(
         mockOtherWorkspace
      );
      expect(queryClient.getQueryData(workspaceBySlugKey('other-org'))).toEqual(
         mockOtherWorkspace
      );
   });

   it('returns null if workspace slug cannot be found across pages', async () => {
      queryClient.setQueryData(authKeys.activeWorkspace(), {
         workspaceId: mockActiveWorkspace.id,
         workspace: mockActiveWorkspace,
      });

      vi.mocked(workspacesApi.list).mockResolvedValueOnce({
         data: [],
         meta: { hasNext: false, limit: 25 },
      } as any);

      const result = await resolveWorkspaceForRoute(mockApi, queryClient, 'unknown-org');

      expect(result).toBeNull();
   });
});
