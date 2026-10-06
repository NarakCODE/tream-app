import React, { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceRouteBoundary } from '../workspaces/workspace-route-boundary';

const mock = vi.hoisted(() => ({ select: vi.fn(), selected: 'old' }));
vi.mock('@/lib/api', () => ({ api: {} }));
vi.mock('@/components/ui/button', () => ({
   Button: (props: React.ComponentProps<'button'>) => <button {...props} />,
}));
vi.mock('@/features/workspaces/hooks', async () => {
   const { useQueryClient } =
      await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
   return {
      useSelectWorkspace: () => {
         const client = useQueryClient();
         return {
            mutateAsync: async (args: { id: string; key: string }) => {
               await mock.select(args);
               await client.invalidateQueries({ queryKey: ['active-workspace'] });
            },
         };
      },
   };
});
vi.mock('@/features/workspaces/queries', () => ({ workspaceKeys: { all: ['workspaces'] } }));
vi.mock('@/features/auth/queries', () => ({
   authKeys: { activeWorkspace: () => ['active-workspace'] },
   activeWorkspaceQueryOptions: () => ({
      queryKey: ['active-workspace'],
      staleTime: 60_000,
      queryFn: async () => ({ workspaceId: mock.selected }),
   }),
   currentUserQueryOptions: () => ({
      queryKey: ['current-user'],
      queryFn: async () => ({ id: 'user' }),
   }),
}));
vi.mock('@/features/auth/hooks', () => ({
   useActiveWorkspace: () =>
      useQuery({
         queryKey: ['active-workspace'],
         staleTime: 60_000,
         queryFn: async () => ({ workspaceId: mock.selected }),
      }),
}));

beforeEach(() => {
   mock.selected = 'old';
   mock.select.mockReset();
   mock.select.mockImplementation(async ({ id }: { id: string }) => {
      mock.selected = id;
   });
});
afterEach(cleanup);
function client() {
   const instance = new QueryClient({ defaultOptions: { queries: { retry: false } } });
   instance.setQueryData(['current-user'], { id: 'user' });
   instance.setQueryData(['active-workspace'], { workspaceId: mock.selected });
   return instance;
}
describe('workspace route boundary', () => {
   it('serializes returning to the original workspace while another selection is pending', async () => {
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
         release = resolve;
      });
      mock.select.mockImplementation(async ({ id }: { id: string }) => {
         if (id === 'new') await pending;
         mock.selected = id;
      });
      const instance = client();
      const view = (workspaceId: string) => (
         <QueryClientProvider client={instance}>
            <WorkspaceRouteBoundary workspaceId={workspaceId} userId="user">
               <p>Inbox ready</p>
            </WorkspaceRouteBoundary>
         </QueryClientProvider>
      );
      const mounted = render(view('new'));
      await waitFor(() => expect(mock.select).toHaveBeenCalledTimes(1));
      mounted.rerender(view('old'));
      expect(screen.queryByText('Inbox ready')).toBeNull();
      expect(mock.select).toHaveBeenCalledTimes(1);
      await act(async () => release());
      await screen.findByText('Inbox ready');
      expect(mock.select.mock.calls.map(([input]) => input.id)).toEqual(['new', 'old']);
      expect(mock.selected).toBe('old');
   });
   it('selects the bookmarked workspace once under StrictMode before showing inbox', async () => {
      render(
         <StrictMode>
            <QueryClientProvider client={client()}>
               <WorkspaceRouteBoundary workspaceId="new" userId="user">
                  <p>Inbox ready</p>
               </WorkspaceRouteBoundary>
            </QueryClientProvider>
         </StrictMode>
      );
      await screen.findByText('Inbox ready');
      expect(mock.select).toHaveBeenCalledTimes(1);
      expect(mock.select).toHaveBeenCalledWith({
         id: 'new',
         key: expect.stringMatching(/^[0-9a-f-]{36}$/),
      });
   });
   it('does not select again when the workspace is already active', async () => {
      mock.selected = 'new';
      render(
         <QueryClientProvider client={client()}>
            <WorkspaceRouteBoundary workspaceId="new" userId="user">
               <p>Inbox ready</p>
            </WorkspaceRouteBoundary>
         </QueryClientProvider>
      );
      await screen.findByText('Inbox ready');
      expect(mock.select).not.toHaveBeenCalled();
   });
   it('blocks workspace selection if the authenticated user changed', async () => {
      const instance = client();
      instance.setQueryData(['current-user'], { id: 'other-user' });
      render(
         <QueryClientProvider client={instance}>
            <WorkspaceRouteBoundary workspaceId="new" userId="user">
               <p>Inbox ready</p>
            </WorkspaceRouteBoundary>
         </QueryClientProvider>
      );
      await waitFor(() =>
         expect(screen.getByRole('alert').textContent).toMatch(/session changed/i)
      );
      expect(mock.select).not.toHaveBeenCalled();
      expect(screen.queryByText('Inbox ready')).toBeNull();
   });
});
