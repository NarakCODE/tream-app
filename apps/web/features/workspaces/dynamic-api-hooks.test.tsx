import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Workspace } from '@repo/schemas';
import { WorkspaceProvider } from './context';
import { useCreateIssue, useIssueList } from '@/features/issues/hooks';
import { useTeamList } from '@/features/teams/hooks';
import { useWorkspaceMembers } from '@/features/workspaces/hooks';
import { issuesApi } from '@/features/issues/api';
import { teamsApi } from '@/features/teams/api';
import { workspacesApi } from '@/features/workspaces/api';

vi.mock('@/lib/api', () => ({ api: {} }));
vi.mock('@/features/issues/api', () => ({
   issuesApi: {
      list: vi.fn().mockResolvedValue({ data: [], meta: { hasNext: false } }),
      create: vi.fn().mockResolvedValue({ id: 'new-issue-id', identifier: 'TEST-1' }),
   },
}));
vi.mock('@/features/teams/api', () => ({
   teamsApi: {
      list: vi.fn().mockResolvedValue({ data: [], meta: { hasNext: false } }),
   },
}));
vi.mock('@/features/workspaces/api', () => ({
   workspacesApi: {
      members: vi.fn().mockResolvedValue({ data: [], meta: { hasNext: false } }),
   },
}));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'test-org' }),
   usePathname: () => '/test-org/my-issues',
}));

const mockWorkspace: Workspace = {
   id: 'ws-dynamic-uuid-1234',
   name: 'Test Org',
   slug: 'test-org',
   settings: {},
   createdAt: '2026-01-01T00:00:00Z',
   updatedAt: '2026-01-01T00:00:00Z',
   archivedAt: null,
   deletedAt: null,
   purgedAt: null,
};

describe('Global API hooks with dynamic domain parent ID resolution', () => {
   function createWrapper() {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      client.setQueryData(['active-workspace'], {
         workspaceId: mockWorkspace.id,
         workspace: mockWorkspace,
      });

      return ({ children }: { children: React.ReactNode }) => (
         <QueryClientProvider client={client}>
            <WorkspaceProvider workspace={mockWorkspace} workspaceId={mockWorkspace.id} orgId="test-org">
               {children}
            </WorkspaceProvider>
         </QueryClientProvider>
      );
   }

   it('useIssueList automatically uses workspaceId from dynamic domain context', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useIssueList({ limit: 10 }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(issuesApi.list).toHaveBeenCalledWith(
         expect.anything(),
         mockWorkspace.id,
         expect.objectContaining({ limit: 10 }),
         expect.anything()
      );
   });

   it('useCreateIssue mutation automatically targets domain workspaceId without explicit argument', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useCreateIssue(), { wrapper });

      await result.current.mutateAsync({
         title: 'Domain issue',
      } as any);

      expect(issuesApi.create).toHaveBeenCalledWith(
         expect.anything(),
         mockWorkspace.id,
         expect.objectContaining({ title: 'Domain issue' })
      );
   });

   it('useTeamList automatically queries teams for current domain workspaceId', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useTeamList(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(teamsApi.list).toHaveBeenCalledWith(
         expect.anything(),
         mockWorkspace.id,
         undefined,
         expect.anything()
      );
   });

   it('useWorkspaceMembers automatically fetches members for current domain workspaceId', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useWorkspaceMembers(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(workspacesApi.members).toHaveBeenCalledWith(
         expect.anything(),
         mockWorkspace.id,
         expect.objectContaining({ limit: 50 })
      );
   });
});
