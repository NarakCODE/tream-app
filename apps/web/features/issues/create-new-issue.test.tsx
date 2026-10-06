import React, { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateNewIssue } from '@/components/layout/sidebar/create-new-issue';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { toast } from 'sonner';

const mock = vi.hoisted(() => ({
   get: vi.fn(),
   patch: vi.fn(),
   post: vi.fn(),
   delete: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ api: mock }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'test-org' }),
   useRouter: () => ({ push: vi.fn() }),
   usePathname: () => '/test-org',
}));

beforeEach(() => {
   vi.resetAllMocks();
   useCreateIssueStore.getState().closeModal();
});

afterEach(cleanup);

function renderWithClient(component: ReactNode) {
   const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
   });
   render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
   return client;
}

const sampleTeam = {
   id: 'team-1',
   workspaceId: 'workspace-1',
   name: 'Core Team',
   key: 'CORE',
   description: null,
   visibility: 'WORKSPACE' as const,
   icon: null,
   color: null,
};

describe('CreateNewIssue component', () => {
   it('opens dialog when trigger is clicked and displays team', async () => {
      mock.get.mockImplementation((url: string) => {
         if (url.includes('/workspaces/active')) {
            return Promise.resolve({
               data: {
                  workspaceId: 'workspace-1',
                  workspace: { id: 'workspace-1', name: 'Test Org', slug: 'test-org' },
                  membership: { id: 'member-1', role: 'MEMBER' },
               },
            });
         }
         if (url.includes('/teams')) {
            return Promise.resolve({
               data: [sampleTeam],
               meta: { total: 1, limit: 50, hasNext: false },
            });
         }
         return Promise.resolve({ data: [] });
      });

      renderWithClient(<CreateNewIssue />);

      const triggerBtn = screen.getByRole('button');
      fireEvent.click(triggerBtn);

      expect(await screen.findByPlaceholderText('Issue title')).toBeTruthy();
      expect(screen.getByText('CORE')).toBeTruthy();
   });

   it('validates required title on submit', async () => {
      mock.get.mockImplementation((url: string) => {
         if (url.includes('/workspaces/active')) {
            return Promise.resolve({
               data: {
                  workspaceId: 'workspace-1',
                  workspace: { id: 'workspace-1', name: 'Test Org', slug: 'test-org' },
                  membership: { id: 'member-1', role: 'MEMBER' },
               },
            });
         }
         if (url.includes('/teams')) {
            return Promise.resolve({
               data: [sampleTeam],
               meta: { total: 1, limit: 50, hasNext: false },
            });
         }
         return Promise.resolve({ data: [] });
      });

      useCreateIssueStore.getState().openModal();
      renderWithClient(<CreateNewIssue />);

      const createBtn = await screen.findByRole('button', { name: 'Create issue' });
      fireEvent.click(createBtn);

      expect(toast.error).toHaveBeenCalledWith('Title is required');
      expect(mock.post).not.toHaveBeenCalled();
   });

   it('creates issue through server API and closes modal', async () => {
      mock.get.mockImplementation((url: string) => {
         if (url.includes('/workspaces/active')) {
            return Promise.resolve({
               data: {
                  workspaceId: 'workspace-1',
                  workspace: { id: 'workspace-1', name: 'Test Org', slug: 'test-org' },
                  membership: { id: 'member-1', role: 'MEMBER' },
               },
            });
         }
         if (url.includes('/teams')) {
            return Promise.resolve({
               data: [sampleTeam],
               meta: { total: 1, limit: 50, hasNext: false },
            });
         }
         return Promise.resolve({ data: [] });
      });

      mock.post.mockResolvedValueOnce({
         data: {
            id: 'issue-new-1',
            workspaceId: 'workspace-1',
            teamId: 'team-1',
            number: 101,
            identifier: 'CORE-101',
            revision: 1,
            title: 'Implement search improvements',
            description: 'Fix full text search latency',
            statusId: 'status-todo',
            priority: 'HIGH',
            createdById: 'member-1',
            createdAt: '2026-10-05T00:00:00.000Z',
            updatedAt: '2026-10-05T00:00:00.000Z',
         },
      });

      useCreateIssueStore.getState().openModal();
      renderWithClient(<CreateNewIssue />);

      expect(await screen.findByText('CORE')).toBeTruthy();

      const titleInput = await screen.findByPlaceholderText('Issue title');
      fireEvent.change(titleInput, { target: { value: 'Implement search improvements' } });

      const descInput = screen.getByPlaceholderText('Add description...');
      fireEvent.change(descInput, { target: { value: 'Fix full text search latency' } });

      const createBtn = screen.getByRole('button', { name: 'Create issue' });
      await waitFor(() => {
         expect(createBtn.hasAttribute('disabled')).toBe(false);
      });
      fireEvent.click(createBtn);

      await waitFor(() => {
         expect(mock.post).toHaveBeenCalledWith(
            '/api/v1/workspaces/workspace-1/issues',
            expect.anything(),
            expect.objectContaining({
               teamId: 'team-1',
               title: 'Implement search improvements',
               description: 'Fix full text search latency',
            }),
            expect.anything()
         );
      });

      await waitFor(() => {
         expect(useCreateIssueStore.getState().isOpen).toBe(false);
      });
   });
});
