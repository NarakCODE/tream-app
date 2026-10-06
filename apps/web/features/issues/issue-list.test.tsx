import React, { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IssueList } from './issue-list';

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

const sampleIssue = {
   id: 'ec0b6588-64ab-5a6d-aef5-ef9d50504115',
   workspaceId: 'workspace-1',
   teamId: '9a6ca9e0-0091-5f17-a5c9-94f65f04e27f',
   number: 9,
   identifier: 'DATA-9',
   revision: 1,
   archivedAt: null,
   parentId: null,
   createdById: '409e31af-e9c4-50d6-a484-801bfeda481f',
   title: 'Review customer feedback after launch',
   description: 'Northstar deliverable...',
   statusId: '39653381-98c0-5351-a599-6fcd39eaa53a',
   priority: 'HIGH' as const,
   assigneeId: 'd7a028cb-7c6c-54dd-a9bf-539ff01de997',
   projectId: '1e321e6a-9aeb-5b86-a7c2-d4a84e93cba3',
   milestoneId: 'd2441d85-5ea9-5aa8-ab13-7deac25d430f',
   cycleId: 'c12cc187-5cb7-5502-a46e-756c415a2eca',
   dueDate: '2026-10-14T15:40:53.405Z',
   estimate: 5,
   sortOrder: 6800,
   createdAt: '2026-09-10T15:40:53.405Z',
   updatedAt: '2026-10-03T23:21:41.405Z',
   deletedAt: null,
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

describe('IssueList component', () => {
   it('renders issue items with identifier and title', async () => {
      mock.get.mockResolvedValueOnce({
         data: [sampleIssue],
         meta: sampleMeta,
      });

      renderWithClient(<IssueList workspaceId="workspace-1" />);

      expect(screen.getByRole('status', { name: 'Loading issues' })).toBeTruthy();

      expect(await screen.findByText('DATA-9')).toBeTruthy();
      expect(screen.getByText('Review customer feedback after launch')).toBeTruthy();
      expect(screen.getByText('5 pts')).toBeTruthy();
      expect(mock.get).toHaveBeenCalledWith(
         '/api/v1/workspaces/workspace-1/issues',
         expect.anything(),
         expect.objectContaining({
            params: expect.objectContaining({
               limit: 50,
            }),
         })
      );
   });

   it('shows empty state when no issues are returned', async () => {
      mock.get.mockResolvedValueOnce({
         data: [],
         meta: { ...sampleMeta, total: 0 },
      });

      renderWithClient(<IssueList workspaceId="workspace-1" />);

      expect(await screen.findByText('No issues found')).toBeTruthy();
      expect(
         screen.getByText('There are currently no issues in this workspace.')
      ).toBeTruthy();
   });

   it('switches lifecycle tabs and refetches with new lifecycle param', async () => {
      mock.get.mockResolvedValueOnce({
         data: [sampleIssue],
         meta: sampleMeta,
      });

      renderWithClient(<IssueList workspaceId="workspace-1" />);

      expect(await screen.findByText('DATA-9')).toBeTruthy();

      mock.get.mockResolvedValueOnce({
         data: [
            { ...sampleIssue, id: 'archived-1', identifier: 'DATA-10', title: 'Archived issue' },
         ],
         meta: { ...sampleMeta, total: 1 },
      });

      fireEvent.click(screen.getByRole('button', { name: /Archived/i }));

      expect(await screen.findByText('DATA-10')).toBeTruthy();
      expect(screen.getByText('Archived issue')).toBeTruthy();
      expect(mock.get).toHaveBeenCalledWith(
         '/api/v1/workspaces/workspace-1/issues',
         expect.anything(),
         expect.objectContaining({
            params: expect.objectContaining({
               lifecycle: 'archived',
            }),
         })
      );
   });

   it('renders error state and allows retry on API error', async () => {
      mock.get.mockRejectedValueOnce(new Error('Network error'));

      renderWithClient(<IssueList workspaceId="workspace-1" />);

      expect(await screen.findByText('Failed to load issues')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();

      mock.get.mockResolvedValueOnce({
         data: [sampleIssue],
         meta: sampleMeta,
      });

      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('DATA-9')).toBeTruthy();
   });

   it('renders Load more button when hasNext is true and requests next page', async () => {
      mock.get.mockResolvedValueOnce({
         data: [sampleIssue],
         meta: {
            ...sampleMeta,
            hasNext: true,
            nextCursor: 'cursor_token_123',
            total: 2,
         },
      });

      renderWithClient(<IssueList workspaceId="workspace-1" />);

      expect(await screen.findByText('DATA-9')).toBeTruthy();
      const loadMoreBtn = screen.getByRole('button', { name: 'Load more issues' });
      expect(loadMoreBtn).toBeTruthy();

      mock.get.mockResolvedValueOnce({
         data: [
            { ...sampleIssue, id: 'issue-2', identifier: 'DATA-2', title: 'Second page issue' },
         ],
         meta: {
            ...sampleMeta,
            hasNext: false,
            nextCursor: null,
            total: 2,
         },
      });

      fireEvent.click(loadMoreBtn);

      expect(await screen.findByText('DATA-2')).toBeTruthy();
      expect(mock.get).toHaveBeenLastCalledWith(
         '/api/v1/workspaces/workspace-1/issues',
         expect.anything(),
         expect.objectContaining({
            params: expect.objectContaining({
               cursor: 'cursor_token_123',
            }),
         })
      );
   });
});
