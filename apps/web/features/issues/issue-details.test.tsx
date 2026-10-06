import React, { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IssueDetails from '@/components/common/issues/details/issue-details';

const mock = vi.hoisted(() => ({
   get: vi.fn(),
   patch: vi.fn(),
   post: vi.fn(),
   delete: vi.fn(),
}));

const mockPush = vi.fn();

vi.mock('@/lib/api', () => ({ api: mock }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'test-org', issueId: 'CORE-101' }),
   useRouter: () => ({ push: mockPush }),
   usePathname: () => '/test-org/issue/CORE-101',
}));

beforeEach(() => {
   vi.resetAllMocks();
});

afterEach(cleanup);

function renderWithClient(component: ReactNode) {
   const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
   });
   render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
   return client;
}

const sampleIssue = {
   id: 'issue-101',
   workspaceId: 'workspace-1',
   teamId: 'team-1',
   number: 101,
   identifier: 'CORE-101',
   revision: 2,
   archivedAt: null,
   parentId: null,
   createdById: 'member-1',
   title: 'Fix latency in caching layer',
   description: 'Investigate Redis roundtrip times under heavy concurrent load.',
   statusId: '39653381-98c0-5351-a599-6fcd39eaa53a',
   priority: 'HIGH' as const,
   assigneeId: null,
   projectId: null,
   milestoneId: null,
   cycleId: null,
   dueDate: null,
   estimate: null,
   sortOrder: 1,
   createdAt: '2026-10-01T00:00:00.000Z',
   updatedAt: '2026-10-02T00:00:00.000Z',
   deletedAt: null,
};

describe('IssueDetails component', () => {
   it('loads and displays server issue details by identifier', async () => {
      mock.get.mockImplementation((url: string) => {
         if (url.includes('/identifier/CORE-101')) {
            return Promise.resolve({ data: sampleIssue });
         }
         if (url.includes('/relations')) {
            return Promise.resolve({ data: [] });
         }
         if (url.includes('/issues')) {
            return Promise.resolve({ data: [], meta: { total: 0, hasNext: false } });
         }
         return Promise.resolve({ data: [] });
      });

      renderWithClient(<IssueDetails workspaceId="workspace-1" initialIssueId="CORE-101" />);

      expect(await screen.findByText('Fix latency in caching layer')).toBeTruthy();
      expect(
         screen.getByText('Investigate Redis roundtrip times under heavy concurrent load.')
      ).toBeTruthy();
   });

   it('allows editing issue title and patches server state', async () => {
      mock.get.mockImplementation((url: string) => {
         if (url.includes('/identifier/CORE-101')) {
            return Promise.resolve({ data: sampleIssue });
         }
         if (url.includes('/relations')) {
            return Promise.resolve({ data: [] });
         }
         if (url.includes('/issues')) {
            return Promise.resolve({ data: [], meta: { total: 0, hasNext: false } });
         }
         return Promise.resolve({ data: [] });
      });

      mock.patch.mockResolvedValueOnce({
         data: { ...sampleIssue, title: 'Fix latency in caching layer (Updated)', revision: 3 },
      });

      renderWithClient(<IssueDetails workspaceId="workspace-1" initialIssueId="CORE-101" />);

      const titleHeading = await screen.findByText('Fix latency in caching layer');
      fireEvent.click(titleHeading);

      const titleInput = screen.getByDisplayValue('Fix latency in caching layer');
      fireEvent.change(titleInput, {
         target: { value: 'Fix latency in caching layer (Updated)' },
      });
      fireEvent.blur(titleInput);

      await waitFor(() => {
         expect(mock.patch).toHaveBeenCalledWith(
            '/api/v1/workspaces/workspace-1/issues/issue-101',
            expect.anything(),
            expect.objectContaining({
               expectedRevision: 2,
               title: 'Fix latency in caching layer (Updated)',
            }),
            expect.anything()
         );
      });
   });

   it('allows archiving an active issue', async () => {
      mock.get.mockImplementation((url: string) => {
         if (url.includes('/identifier/CORE-101')) {
            return Promise.resolve({ data: sampleIssue });
         }
         if (url.includes('/relations')) {
            return Promise.resolve({ data: [] });
         }
         if (url.includes('/issues')) {
            return Promise.resolve({ data: [], meta: { total: 0, hasNext: false } });
         }
         return Promise.resolve({ data: [] });
      });

      mock.post.mockResolvedValueOnce({
         data: { ...sampleIssue, archivedAt: '2026-10-05T00:00:00.000Z', revision: 3 },
      });

      renderWithClient(<IssueDetails workspaceId="workspace-1" initialIssueId="CORE-101" />);

      const archiveBtn = await screen.findByRole('button', { name: /Archive issue/i });
      fireEvent.click(archiveBtn);

      await waitFor(() => {
         expect(mock.post).toHaveBeenCalledWith(
            '/api/v1/workspaces/workspace-1/issues/issue-101/archive',
            expect.anything(),
            { expectedRevision: 2 },
            expect.anything()
         );
      });
   });

   it('allows deleting an issue and redirects to issues listing', async () => {
      mock.get.mockImplementation((url: string) => {
         if (url.includes('/identifier/CORE-101')) {
            return Promise.resolve({ data: sampleIssue });
         }
         if (url.includes('/relations')) {
            return Promise.resolve({ data: [] });
         }
         if (url.includes('/issues')) {
            return Promise.resolve({ data: [], meta: { total: 0, hasNext: false } });
         }
         return Promise.resolve({ data: [] });
      });

      mock.delete.mockResolvedValueOnce({
         data: { ...sampleIssue, deletedAt: '2026-10-05T00:00:00.000Z', revision: 3 },
      });

      renderWithClient(<IssueDetails workspaceId="workspace-1" initialIssueId="CORE-101" />);

      const deleteBtn = await screen.findByRole('button', { name: /Delete issue/i });
      fireEvent.click(deleteBtn);

      await waitFor(() => {
         expect(mock.delete).toHaveBeenCalledWith(
            '/api/v1/workspaces/workspace-1/issues/issue-101',
            expect.anything(),
            expect.objectContaining({
               body: { expectedRevision: 2 },
            })
         );
         expect(mockPush).toHaveBeenCalledWith('/test-org/issues');
      });
   });
});
