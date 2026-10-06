import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssigneeUser } from './assignee-user';
import { IssueLine } from './issue-line';
import { users } from '@/mock-data/users';
import type { Issue } from '@/mock-data/issues';
import type { Status } from '@/mock-data/status';
import type { Priority } from '@/mock-data/priorities';

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'test-org' }),
   usePathname: () => '/test-org/issues',
}));

beforeEach(() => {
   vi.clearAllMocks();
});

afterEach(cleanup);

function renderWithClient(ui: React.ReactNode) {
   const queryClient = new QueryClient({
      defaultOptions: {
         queries: { retry: false },
         mutations: { retry: false },
      },
   });
   return {
      queryClient,
      ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
   };
}

describe('AssigneeUser Spinner & Pending States', () => {
   it('renders normal avatar or fallback when not pending', () => {
      renderWithClient(<AssigneeUser user={users[0] ?? null} />);

      const button = screen.getByRole('button', { name: new RegExp(users[0]?.name ?? '', 'i') });
      expect(button).toBeDefined();
      expect(button.getAttribute('disabled')).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
   });

   it('renders Spinner and disables button when isPending prop is true', () => {
      renderWithClient(<AssigneeUser user={users[0] ?? null} isPending={true} />);

      const button = screen.getByRole('button', { name: /updating assignee…/i });
      expect(button).toBeDefined();
      expect(button.hasAttribute('disabled')).toBe(true);

      const spinner = screen.getByRole('status');
      expect(spinner).toBeDefined();
      expect(spinner.getAttribute('aria-label')).toBe('Loading');
   });

   it('displays Spinner during async assignment onChange and clears it on resolution', async () => {
      let resolveAssignment!: () => void;
      const onChange = vi.fn().mockImplementation(() => {
         return new Promise<void>((resolve) => {
            resolveAssignment = resolve;
         });
      });

      renderWithClient(
         <AssigneeUser user={null} onChange={onChange} />
      );

      // Open dropdown
      const trigger = screen.getByRole('button', { name: /no assignee/i });
      fireEvent.pointerDown(trigger, { button: 0 });

      // Select first user from dropdown
      const targetUser = users[0];
      if (!targetUser) throw new Error('No user in mock data');
      const menuItem = await screen.findByText(targetUser.name);
      fireEvent.click(menuItem);

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: targetUser.id }));

      // While promise is pending, Spinner must be visible and trigger disabled
      await waitFor(() => {
         expect(screen.getByRole('status')).toBeDefined();
      });
      const pendingTrigger = screen.getByRole('button', { name: /updating assignee…/i });
      expect(pendingTrigger.hasAttribute('disabled')).toBe(true);

      // Resolve the assignment promise
      resolveAssignment();

      // Spinner should be replaced by assigned user avatar
      await waitFor(() => {
         expect(screen.queryByRole('status')).toBeNull();
         expect(screen.getByRole('button', { name: new RegExp(targetUser.name, 'i') })).toBeDefined();
      });
   });

   it('displays Spinner in IssueLine during assignment', async () => {
      let resolveAssignment!: () => void;
      const onAssigneeChange = vi.fn().mockImplementation(() => {
         return new Promise<void>((resolve) => {
            resolveAssignment = resolve;
         });
      });

      const sampleIssue: Issue = {
         id: 'issue-101',
         identifier: 'TEST-101',
         title: 'Test Issue with Pending Assignee',
         description: 'Testing spinner',
         status: { id: 'todo', name: 'Todo', color: '#ccc', category: 'unstarted', icon: () => null } as unknown as Status,
         priority: { id: 'high', name: 'High' } as unknown as Priority,
         assignee: null,
         labels: [],
         createdAt: new Date().toISOString(),
         cycleId: '',
         rank: '0|hzzzzz:',
         revision: 1,
      };

      renderWithClient(
         <IssueLine
            issue={sampleIssue}
            onAssigneeChange={onAssigneeChange}
         />
      );

      // Open assignee dropdown
      const assigneeBtn = screen.getByRole('button', { name: /no assignee/i });
      fireEvent.pointerDown(assigneeBtn, { button: 0 });

      const targetUser = users[1];
      if (!targetUser) throw new Error('No user in mock data');
      const item = await screen.findByText(targetUser.name);
      fireEvent.click(item);

      expect(onAssigneeChange).toHaveBeenCalledWith(
         sampleIssue,
         expect.objectContaining({ id: targetUser.id })
      );

      // Spinner appears while pending
      await waitFor(() => {
         expect(screen.getByRole('status')).toBeDefined();
      });

      // Finish assignment
      resolveAssignment();

      await waitFor(() => {
         expect(screen.queryByRole('status')).toBeNull();
      });
   });
});
