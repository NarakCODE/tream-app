import React, { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyIssuesList } from './my-issues-list';

const mock = vi.hoisted(() => ({
   get: vi.fn(),
   patch: vi.fn(),
   post: vi.fn(),
   delete: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api: mock }));
vi.mock('@/components/ui/sidebar', () => ({ SidebarTrigger: () => <button>Sidebar</button> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'test-org' }),
   usePathname: () => '/test-org',
}));
vi.mock('@/features/auth/hooks', () => ({
   useActiveWorkspace: () => ({
      data: {
         workspaceId: 'workspace-1',
         membership: { id: 'member-123', userId: 'user-1', role: 'ADMIN' },
      },
   }),
}));

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

function renderWithClient(component: ReactNode) {
   const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
   });
   render(
      <NuqsTestingAdapter>
         <QueryClientProvider client={client}>{component}</QueryClientProvider>
      </NuqsTestingAdapter>
   );
   return client;
}

const sampleAssignedIssue = {
   id: 'ec0b6588-64ab-5a6d-aef5-ef9d50504115',
   workspaceId: 'workspace-1',
   teamId: '9a6ca9e0-0091-5f17-a5c9-94f65f04e27f',
   number: 9,
   identifier: 'DATA-9',
   revision: 1,
   archivedAt: null,
   parentId: null,
   createdById: 'other-user',
   title: 'My assigned work item',
   description: 'Work deliverable...',
   statusId: '39653381-98c0-5351-a599-6fcd39eaa53a',
   priority: 'HIGH' as const,
   assigneeId: 'member-123',
   projectId: '1e321e6a-9aeb-5b86-a7c2-d4a84e93cba3',
   milestoneId: null,
   cycleId: null,
   dueDate: '2026-10-14T15:40:53.405Z',
   estimate: 3,
   sortOrder: 6800,
   createdAt: '2026-09-10T15:40:53.405Z',
   updatedAt: '2026-10-03T23:21:41.405Z',
   deletedAt: null,
};

const sampleCreatedIssue = {
   ...sampleAssignedIssue,
   id: 'created-issue-id',
   identifier: 'DATA-10',
   title: 'Issue I created for team',
   createdById: 'member-123',
   assigneeId: 'other-user',
};

const sampleMeta = {
   requestId: 'req_123',
   timestamp: '2026-10-05T07:15:34.347Z',
   cursor: null,
   nextCursor: null,
   hasNext: false,
   limit: 25,
   total: 1,
};

describe('MyIssuesList component', () => {
   it('renders assigned issues and requests with assigneeId', async () => {
      mock.get.mockImplementation(() =>
         Promise.resolve({
            data: [sampleAssignedIssue],
            meta: sampleMeta,
         })
      );

      renderWithClient(
         <MyIssuesList
            workspaceId="workspace-1"
            currentMemberId="member-123"
            initialTab="assigned"
         />
      );

      expect(screen.getByText('My issues')).toBeTruthy();
      expect(await screen.findByText('DATA-9')).toBeTruthy();
      expect(screen.getByText('My assigned work item')).toBeTruthy();
      expect(screen.getByText('3 pts')).toBeTruthy();

      expect(mock.get).toHaveBeenCalledWith(
         '/api/v1/workspaces/workspace-1/issues',
         expect.anything(),
         expect.objectContaining({
            params: expect.objectContaining({
               assigneeId: 'member-123',
               limit: 50,
            }),
         })
      );
   });

   it('switches to Created tab and queries with createdById', async () => {
      mock.get.mockImplementation(
         (_url: string, _schema: unknown, options: { params?: { createdById?: string } }) => {
            if (options?.params?.createdById === 'member-123') {
               return Promise.resolve({
                  data: [sampleCreatedIssue],
                  meta: sampleMeta,
               });
            }
            return Promise.resolve({
               data: [sampleAssignedIssue],
               meta: sampleMeta,
            });
         }
      );

      renderWithClient(
         <MyIssuesList
            workspaceId="workspace-1"
            currentMemberId="member-123"
            initialTab="assigned"
         />
      );

      expect(await screen.findByText('My assigned work item')).toBeTruthy();

      const createdTab = screen.getByRole('button', { name: 'Created' });
      fireEvent.click(createdTab);

      expect(await screen.findByText('Issue I created for team')).toBeTruthy();
      expect(mock.get).toHaveBeenLastCalledWith(
         '/api/v1/workspaces/workspace-1/issues',
         expect.anything(),
         expect.objectContaining({
            params: expect.objectContaining({
               createdById: 'member-123',
               limit: 50,
            }),
         })
      );
   });

   it('switches lifecycle tab to Archived and loads archived issues', async () => {
      mock.get.mockImplementation(
         (_url: string, _schema: unknown, options: { params?: { lifecycle?: string } }) => {
            if (options?.params?.lifecycle === 'archived') {
               return Promise.resolve({
                  data: [
                     {
                        ...sampleAssignedIssue,
                        id: 'archived-id',
                        identifier: 'DATA-7',
                        title: 'Archived task',
                        archivedAt: '2026-10-01T00:00:00Z',
                     },
                  ],
                  meta: sampleMeta,
               });
            }
            return Promise.resolve({
               data: [sampleAssignedIssue],
               meta: sampleMeta,
            });
         }
      );

      renderWithClient(
         <MyIssuesList
            workspaceId="workspace-1"
            currentMemberId="member-123"
            initialTab="assigned"
         />
      );

      expect(await screen.findByText('My assigned work item')).toBeTruthy();

      const archivedTab = screen.getByRole('button', { name: 'Archived' });
      fireEvent.click(archivedTab);

      expect(await screen.findByText('Archived task')).toBeTruthy();
      expect(mock.get).toHaveBeenLastCalledWith(
         '/api/v1/workspaces/workspace-1/issues',
         expect.anything(),
         expect.objectContaining({
            params: expect.objectContaining({
               lifecycle: 'archived',
            }),
         })
      );
   });

   it('shows tab-specific empty state when no issues exist', async () => {
      mock.get.mockImplementation(() =>
         Promise.resolve({
            data: [],
            meta: { ...sampleMeta, total: 0 },
         })
      );

      renderWithClient(
         <MyIssuesList
            workspaceId="workspace-1"
            currentMemberId="member-123"
            initialTab="assigned"
         />
      );

      expect(await screen.findByText('No issues found')).toBeTruthy();
      expect(
         screen.getByText('No issues assigned to you.')
      ).toBeTruthy();
   });

   it('handles error state and retries query', async () => {
      let callCount = 0;
      mock.get.mockImplementation(() => {
         callCount++;
         if (callCount === 1) {
            return Promise.reject(new Error('Network error'));
         }
         return Promise.resolve({
            data: [sampleAssignedIssue],
            meta: sampleMeta,
         });
      });

      renderWithClient(
         <MyIssuesList
            workspaceId="workspace-1"
            currentMemberId="member-123"
            initialTab="assigned"
         />
      );

      expect(await screen.findByText('Failed to load your issues')).toBeTruthy();

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryBtn);

      expect(await screen.findByText('My assigned work item')).toBeTruthy();
   });
});
