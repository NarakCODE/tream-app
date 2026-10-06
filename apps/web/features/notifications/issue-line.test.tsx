import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IssueLine from '@/components/common/inbox/issue-line';
import type { Notification } from '@repo/schemas';

const mockNotification = (overrides: Partial<Notification> = {}): Notification => ({
   id: 'notif-1',
   workspaceId: 'ws-1',
   recipientMembershipId: 'member-recipient',
   actorMembershipId: 'member-1',
   eventId: 'event-1',
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
   ...overrides,
});

vi.mock('@/features/notifications/hooks', () => ({
   useNotificationTarget: () => ({
      data: { identifier: 'TRE-123', title: 'Fix compiler issue' },
      isPending: false,
      error: null,
   }),
   useNotificationActor: () => ({
      data: { name: 'John Doe', avatarUrl: 'https://example.com/avatar.png' },
      isPending: false,
      error: null,
   }),
}));

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

function renderWithClient(ui: React.ReactElement) {
   const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
   });
   return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('IssueLine component with AvatarBadge', () => {
   it('renders AvatarBadge with aria-label="Unread" on Avatar when notification is unread', () => {
      renderWithClient(
         <IssueLine
            notification={mockNotification({ readAt: null })}
            workspaceId="ws-1"
            userId="user-1"
            isSelected={false}
            onClick={() => {}}
         />
      );

      const unreadBadge = screen.getByLabelText('Unread');
      expect(unreadBadge).toBeTruthy();
      expect(unreadBadge.getAttribute('data-slot')).toBe('avatar-badge');
   });

   it('does not render AvatarBadge when notification is read', () => {
      renderWithClient(
         <IssueLine
            notification={mockNotification({ readAt: new Date().toISOString() })}
            workspaceId="ws-1"
            userId="user-1"
            isSelected={false}
            onClick={() => {}}
         />
      );

      expect(screen.queryByLabelText('Unread')).toBeNull();
   });

   it('renders Linear-style two-row layout with title, identifier, snippet and compact time', () => {
      renderWithClient(
         <IssueLine
            notification={mockNotification({
               readAt: null,
               createdAt: new Date(Date.now() - 3600000).toISOString(),
            })}
            workspaceId="ws-1"
            userId="user-1"
            isSelected={false}
            onClick={() => {}}
         />
      );

      // Top row
      expect(screen.getByText('TRE-123')).toBeTruthy();
      expect(screen.getByText('Fix compiler issue')).toBeTruthy();
      expect(screen.getByText('Unread')).toBeTruthy();

      // Bottom row
      expect(screen.getByText('John Doe')).toBeTruthy();
      expect(screen.getByText(/assigned you to this issue/)).toBeTruthy();
      expect(screen.getByText('1h')).toBeTruthy();
   });
});
