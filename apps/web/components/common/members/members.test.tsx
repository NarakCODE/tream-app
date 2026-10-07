import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Membership } from '@repo/schemas';
import Members from './members';

const mockMembersData = vi.hoisted(() => ({
   items: [] as Membership[],
   isPending: false,
   isError: false,
   error: null as Error | null,
   hasNextPage: false,
   isFetchingNextPage: false,
   fetchNextPage: vi.fn(),
   refetch: vi.fn(),
}));

const mockFilterStore = vi.hoisted(() => ({
   filters: { role: [] as string[] },
   sort: 'name-asc',
   clearFilters: vi.fn(),
}));

const mockUpdateMemberMutateAsync = vi.fn();
const mockRemoveMemberMutateAsync = vi.fn();

vi.mock('@/features/workspaces/hooks', () => ({
   useWorkspaceMembers: () => ({
      data: {
         pages: [
            {
               data: mockMembersData.items,
               meta: {
                  hasNext: mockMembersData.hasNextPage,
                  nextCursor: mockMembersData.hasNextPage ? 'next-cursor' : null,
                  total: mockMembersData.items.length,
               },
            },
         ],
      },
      isPending: mockMembersData.isPending,
      isError: mockMembersData.isError,
      error: mockMembersData.error,
      hasNextPage: mockMembersData.hasNextPage,
      isFetchingNextPage: mockMembersData.isFetchingNextPage,
      fetchNextPage: mockMembersData.fetchNextPage,
      refetch: mockMembersData.refetch,
   }),
   useUpdateWorkspaceMember: () => ({
      mutateAsync: mockUpdateMemberMutateAsync,
      isPending: false,
   }),
   useRemoveWorkspaceMember: () => ({
      mutateAsync: mockRemoveMemberMutateAsync,
      isPending: false,
   }),
}));

vi.mock('@/store/members-filter-store', () => ({
   useMembersFilterStore: () => mockFilterStore,
}));

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'test-org' }),
}));

beforeEach(() => {
   vi.resetAllMocks();
   mockFilterStore.filters.role = [];
   mockFilterStore.sort = 'name-asc';
   mockMembersData.isPending = false;
   mockMembersData.isError = false;
   mockMembersData.error = null;
   mockMembersData.hasNextPage = false;
   mockMembersData.isFetchingNextPage = false;
   mockMembersData.items = [];
});

afterEach(cleanup);

function renderWithClient(ui: React.ReactElement) {
   const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
   });
   return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const sampleMembers: Membership[] = [
   {
      id: 'mem-1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      role: 'OWNER',
      state: 'ACTIVE',
      user: {
         id: 'user-1',
         name: 'Sarah Connor',
         email: 'sarah@example.com',
         avatarUrl: 'https://example.com/sarah.png',
      },
      createdAt: '2026-01-10T12:00:00.000Z',
      updatedAt: '2026-01-10T12:00:00.000Z',
   },
   {
      id: 'mem-2',
      workspaceId: 'ws-1',
      userId: 'user-2',
      role: 'MEMBER',
      state: 'ACTIVE',
      user: {
         id: 'user-2',
         name: 'John Reese',
         email: 'john@example.com',
         avatarUrl: null,
      },
      createdAt: '2026-02-15T12:00:00.000Z',
      updatedAt: '2026-02-15T12:00:00.000Z',
   },
];

describe('Members listing component wired to workspace API queries', () => {
   it('renders skeleton loading state while query is pending', () => {
      mockMembersData.isPending = true;
      renderWithClient(<Members workspaceId="ws-1" />);

      const loadingContainer = screen.getByRole('status', { name: /loading workspace members/i });
      expect(loadingContainer).toBeTruthy();
   });

   it('renders error alert with retry button when query fails', () => {
      mockMembersData.isError = true;
      mockMembersData.error = new Error('Network connection failed');
      renderWithClient(<Members workspaceId="ws-1" />);

      const alert = screen.getByRole('alert');
      expect(alert).toBeTruthy();
      expect(screen.getByText('Unable to load workspace members.')).toBeTruthy();
      expect(screen.getByText('Network connection failed')).toBeTruthy();

      const retryBtn = screen.getByRole('button', { name: /try again/i });
      fireEvent.click(retryBtn);
      expect(mockMembersData.refetch).toHaveBeenCalled();
   });

   it('renders empty workspace members placeholder when no members exist', () => {
      mockMembersData.items = [];
      renderWithClient(<Members workspaceId="ws-1" />);

      expect(screen.getByText('No members found')).toBeTruthy();
      expect(screen.getByText('Invite team members to collaborate in this workspace.')).toBeTruthy();
   });

   it('renders member rows with display name, role badge, joined date, and avatar', () => {
      mockMembersData.items = sampleMembers;
      renderWithClient(<Members workspaceId="ws-1" />);

      expect(screen.getByText('Sarah Connor')).toBeTruthy();
      expect(screen.getByText('sarah@example.com')).toBeTruthy();
      expect(screen.getByText('Owner')).toBeTruthy();

      expect(screen.getByText('John Reese')).toBeTruthy();
      expect(screen.getByText('john@example.com')).toBeTruthy();
      expect(screen.getByText('Member')).toBeTruthy();
   });

   it('filters members based on active role filter', () => {
      mockMembersData.items = sampleMembers;
      mockFilterStore.filters.role = ['Member'];
      renderWithClient(<Members workspaceId="ws-1" />);

      expect(screen.getByText('John Reese')).toBeTruthy();
      expect(screen.queryByText('Sarah Connor')).toBeNull();
   });

   it('shows empty filter state with clear filters button when filters match nothing', () => {
      mockMembersData.items = sampleMembers;
      mockFilterStore.filters.role = ['Guest'];
      renderWithClient(<Members workspaceId="ws-1" />);

      expect(screen.getByText('No members match the selected filters.')).toBeTruthy();
      const clearBtn = screen.getByRole('button', { name: /clear filters/i });
      fireEvent.click(clearBtn);
      expect(mockFilterStore.clearFilters).toHaveBeenCalled();
   });

   it('renders Load more button when hasNextPage is true', () => {
      mockMembersData.items = sampleMembers;
      mockMembersData.hasNextPage = true;
      renderWithClient(<Members workspaceId="ws-1" />);

      const loadMoreBtn = screen.getByRole('button', { name: /load more members/i });
      expect(loadMoreBtn).toBeTruthy();
      fireEvent.click(loadMoreBtn);
      expect(mockMembersData.fetchNextPage).toHaveBeenCalled();
   });

   it('renders action dropdown buttons for members and handles suspend action', async () => {
      mockMembersData.items = sampleMembers;
      renderWithClient(<Members workspaceId="ws-1" />);

      const actionBtn = screen.getByRole('button', { name: 'Actions for John Reese' });
      expect(actionBtn).toBeTruthy();

      fireEvent.pointerDown(actionBtn, { button: 0 });

      const suspenseItem = await screen.findByText('Suspense');
      expect(suspenseItem).toBeTruthy();
      expect(screen.getByText('Update role')).toBeTruthy();
      expect(screen.getByText('Remove from workspace')).toBeTruthy();

      fireEvent.click(suspenseItem);
      expect(mockUpdateMemberMutateAsync).toHaveBeenCalledWith(
         expect.objectContaining({
            membershipId: 'mem-2',
            input: { state: 'SUSPENDED' },
            workspaceId: 'ws-1',
         })
      );
   });

   it('renders reactivate action for suspended members and handles reactivation', async () => {
      mockMembersData.items = [
         {
            ...sampleMembers[1]!,
            state: 'SUSPENDED',
         },
      ];
      renderWithClient(<Members workspaceId="ws-1" />);

      const actionBtn = screen.getByRole('button', { name: 'Actions for John Reese' });
      fireEvent.pointerDown(actionBtn, { button: 0 });

      const reactivateItem = await screen.findByText('Reactivate');
      expect(reactivateItem).toBeTruthy();
      expect(screen.queryByText('Suspense')).toBeNull();

      fireEvent.click(reactivateItem);
      expect(mockUpdateMemberMutateAsync).toHaveBeenCalledWith(
         expect.objectContaining({
            membershipId: 'mem-2',
            input: { state: 'ACTIVE' },
            workspaceId: 'ws-1',
         })
      );
   });

   it('handles removing member from workspace', async () => {
      mockMembersData.items = sampleMembers;
      renderWithClient(<Members workspaceId="ws-1" />);

      const actionBtn = screen.getByRole('button', { name: 'Actions for John Reese' });
      fireEvent.pointerDown(actionBtn, { button: 0 });

      const removeItem = await screen.findByText('Remove from workspace');
      fireEvent.click(removeItem);

      expect(mockRemoveMemberMutateAsync).toHaveBeenCalledWith(
         expect.objectContaining({
            membershipId: 'mem-2',
            workspaceId: 'ws-1',
         })
      );
   });

   it('disables destructive and role change actions for workspace owner', async () => {
      mockMembersData.items = sampleMembers;
      renderWithClient(<Members workspaceId="ws-1" />);

      const ownerActionBtn = screen.getByRole('button', { name: 'Actions for Sarah Connor' });
      fireEvent.pointerDown(ownerActionBtn, { button: 0 });

      const suspenseItem = await screen.findByText('Suspense');
      const removeItem = screen.getByText('Remove from workspace');
      const updateRoleTrigger = screen.getByText('Update role');

      expect(suspenseItem.closest('[data-disabled]')).toBeTruthy();
      expect(removeItem.closest('[data-disabled]')).toBeTruthy();
      expect(updateRoleTrigger.closest('[data-disabled]')).toBeTruthy();
   });
});
