import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Workspace } from '@repo/schemas';
import { authKeys } from '@/features/auth/queries';
import {
   WorkspaceProvider,
   useCurrentWorkspace,
   useDomainUrl,
   useParentIds,
   useWorkspaceId,
} from './context';

vi.mock('@/lib/api', () => ({ api: {} }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'acme-slug', teamId: 'team-uuid-123' }),
   usePathname: () => '/acme-slug/team/team-uuid-123/all',
}));

const mockWorkspace: Workspace = {
   id: '11111111-2222-3333-4444-555555555555',
   name: 'Acme Corp',
   slug: 'acme-slug',
   settings: {},
   createdAt: '2026-01-01T00:00:00Z',
   updatedAt: '2026-01-01T00:00:00Z',
   archivedAt: null,
   deletedAt: null,
   purgedAt: null,
};

function Consumer() {
   const workspaceId = useWorkspaceId();
   const { workspace, orgId, isReady } = useCurrentWorkspace();
   const parentIds = useParentIds();
   const domainUrl = useDomainUrl();

   return (
      <div>
         <span data-testid="workspace-id">{workspaceId}</span>
         <span data-testid="workspace-name">{workspace?.name}</span>
         <span data-testid="org-id">{orgId}</span>
         <span data-testid="team-id">{parentIds.teamId}</span>
         <span data-testid="is-ready">{String(isReady)}</span>
         <span data-testid="built-path">{domainUrl.buildPath('/my-issues')}</span>
      </div>
   );
}

describe('WorkspaceProvider and domain URL hooks', () => {
   afterEach(() => {
      cleanup();
   });

   function renderWithClient(ui: React.ReactNode) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      client.setQueryData(authKeys.activeWorkspace(), {
         workspaceId: mockWorkspace.id,
         workspace: mockWorkspace,
         membership: { id: 'mem-1', role: 'ADMIN' },
      });
      return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
   }

   it('provides resolved workspace and parent IDs to descendants', () => {
      renderWithClient(
         <WorkspaceProvider workspace={mockWorkspace} workspaceId={mockWorkspace.id} orgId="acme-slug">
            <Consumer />
         </WorkspaceProvider>
      );

      expect(screen.getByTestId('workspace-id').textContent).toBe(mockWorkspace.id);
      expect(screen.getByTestId('workspace-name').textContent).toBe('Acme Corp');
      expect(screen.getByTestId('org-id').textContent).toBe('acme-slug');
      expect(screen.getByTestId('team-id').textContent).toBe('team-uuid-123');
      expect(screen.getByTestId('is-ready').textContent).toBe('true');
      expect(screen.getByTestId('built-path').textContent).toBe('/acme-slug/my-issues');
   });

   it('resolves workspaceId without provider via route and active workspace fallback', () => {
      renderWithClient(<Consumer />);

      expect(screen.getByTestId('workspace-id').textContent).toBe(mockWorkspace.id);
      expect(screen.getByTestId('team-id').textContent).toBe('team-uuid-123');
   });

   it('prioritizes explicitly passed workspaceId in useWorkspaceId', () => {
      function ExplicitConsumer() {
         const id = useWorkspaceId('override-id');
         return <span data-testid="override-id">{id}</span>;
      }

      renderWithClient(
         <WorkspaceProvider workspace={mockWorkspace} workspaceId={mockWorkspace.id}>
            <ExplicitConsumer />
         </WorkspaceProvider>
      );

      expect(screen.getByTestId('override-id').textContent).toBe('override-id');
   });
});
