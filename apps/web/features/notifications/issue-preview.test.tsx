import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationPreview from '@/components/common/inbox/issue-preview';
import type { Notification } from '@repo/schemas';

const mockApi = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: mockApi }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'test-org' }),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function renderWithClient(ui: React.ReactNode) {
   const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
   });
   return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('NotificationPreview empty state', () => {
   it('renders empty preview placeholder and blocks wheel and touchmove scroll', () => {
      render(
         <NotificationPreview
            notification={undefined}
            workspaceId="ws-1"
            userId="user-1"
            emailEnabled={true}
         />
      );

      const heading = screen.getByText('Select a notification');
      expect(heading).toBeTruthy();

      const emptyContainer = screen.getByRole('heading', {
         name: 'Select a notification',
      }).parentElement;
      expect(emptyContainer).toBeTruthy();
      expect(emptyContainer?.getAttribute('data-slot')).toBe('empty-preview');
      expect(emptyContainer?.className).toContain('overflow-hidden');
      expect(emptyContainer?.className).toContain('overscroll-none');
      expect(emptyContainer?.className).toContain('touch-none');

      // Test wheel event scroll blocking
      const wheelEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
      emptyContainer?.dispatchEvent(wheelEvent);
      expect(wheelEvent.defaultPrevented).toBe(true);

      // Test touchmove event scroll blocking
      const touchEvent = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
      emptyContainer?.dispatchEvent(touchEvent);
      expect(touchEvent.defaultPrevented).toBe(true);
   });

   it('renders deep link to target issue when notification is selected', async () => {
      const sampleNotification: Notification = {
         id: 'notif-1',
         workspaceId: 'ws-1',
         recipientMembershipId: 'mem-1',
         actorMembershipId: 'mem-2',
         eventId: 'evt-1',
         kind: 'ASSIGNMENT',
         issueId: 'issue-1',
         projectId: null,
         initiativeId: null,
         documentId: null,
         revision: 1,
         readAt: null,
         archivedAt: null,
         snoozedUntil: null,
         createdAt: new Date().toISOString(),
         updatedAt: new Date().toISOString(),
      };

      mockApi.get.mockImplementation((url: string) => {
         if (url.includes('/actor')) {
            return Promise.resolve({
               data: { membershipId: 'mem-2', name: 'John Doe', avatarUrl: null },
            });
         }
         if (url.includes('/issues/issue-1')) {
            return Promise.resolve({
               data: {
                  id: 'issue-1',
                  identifier: 'ENG-101',
                  title: 'Fix issue sync',
                  description: 'Detailed description of the issue',
               },
            });
         }
         return Promise.resolve({ data: [] });
      });

      renderWithClient(
         <NotificationPreview
            notification={sampleNotification}
            workspaceId="ws-1"
            userId="user-1"
            emailEnabled={true}
         />
      );

      const openButton = await screen.findByRole('link', { name: /open issue/i });
      expect(openButton).toBeTruthy();
      expect(openButton.getAttribute('href')).toBe('/test-org/issue/ENG-101');

      const titleLink = screen.getByRole('link', { name: /fix issue sync/i });
      expect(titleLink).toBeTruthy();
      expect(titleLink.getAttribute('href')).toBe('/test-org/issue/ENG-101');

      const identifierLink = screen.getByRole('link', { name: 'ENG-101' });
      expect(identifierLink.getAttribute('href')).toBe('/test-org/issue/ENG-101');
   });
});
