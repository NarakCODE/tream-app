import React, { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Inbox from '@/components/common/inbox/inbox';
import { NotificationDeliveries } from '@/components/common/inbox/notification-deliveries';
import { NotificationPreferences } from '@/components/common/inbox/notification-preferences';

const mock = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: mock }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/ui/sidebar', () => ({ SidebarTrigger: () => <button>Sidebar</button> }));
vi.mock('@/components/ui/resizable', () => ({
   ResizableHandle: () => null,
   ResizablePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
   ResizablePanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/common/inbox/issue-line', () => ({
   default: () => <li>Notification row</li>,
}));
vi.mock('@/components/common/inbox/issue-preview', () => ({
   default: () => <div>Read-only preview</div>,
}));

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
function show(component: ReactNode) {
   const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
   });
   render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
   return client;
}
const job = (status: string) => ({
   id: 'job',
   status,
   attemptCount: 2,
   lastErrorCode: null,
   sentAt: null,
});

describe('inbox error and email safety UI', () => {
   it('shows a preferences GET error instead of an endless list skeleton', async () => {
      mock.get.mockRejectedValue(new Error('Offline'));
      show(<Inbox workspaceId="w" userId="u" />);
      expect(await screen.findByText('Unable to load notification preferences.')).toBeTruthy();
      expect(screen.queryByLabelText('Loading notifications')).toBeNull();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
      expect(mock.get.mock.calls.every(([url]) => String(url).endsWith('/preferences'))).toBe(true);
   });
   it('requires explicit UNKNOWN confirmation before sending duplicate acknowledgement', async () => {
      mock.get.mockResolvedValue({ data: [job('UNKNOWN')], meta: {} });
      mock.post.mockResolvedValue({ data: { id: 'job', status: 'PENDING' }, meta: {} });
      show(<NotificationDeliveries workspaceId="w" userId="u" notificationId="n" emailEnabled />);
      fireEvent.click(screen.getByRole('button', { name: 'Email delivery' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Retry email' }));
      expect(mock.post).not.toHaveBeenCalled();
      expect(screen.getByText(/Retrying may send a duplicate email/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(mock.post).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Retry email' }));
      fireEvent.click(screen.getByRole('button', { name: 'Retry and accept possible duplicate' }));
      await waitFor(() => expect(mock.post).toHaveBeenCalledTimes(1));
      expect(mock.post.mock.calls[0][2]).toEqual({ acknowledgePossibleDuplicate: true });
   });
   it('disables retry when email notifications are off', async () => {
      mock.get.mockResolvedValue({ data: [job('FAILED')], meta: {} });
      show(
         <NotificationDeliveries
            workspaceId="w"
            userId="u"
            notificationId="n"
            emailEnabled={false}
         />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Email delivery' }));
      const retry = await screen.findByRole('button', { name: 'Retry email' });
      expect((retry as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(retry);
      expect(mock.post).not.toHaveBeenCalled();
   });
   it('renders unread only toggle in notification preferences and calls callback', async () => {
      const onUnreadOnlyChange = vi.fn();
      mock.get.mockResolvedValue({
         data: { inAppEnabled: true, emailEnabled: true },
         meta: {},
      });
      show(
         <NotificationPreferences
            workspaceId="w"
            userId="u"
            unreadOnly={false}
            onUnreadOnlyChange={onUnreadOnlyChange}
         />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Notification preferences' }));
      const toggle = await screen.findByRole('switch', { name: 'Unread only' });
      expect(toggle).toBeTruthy();
      expect(toggle.getAttribute('aria-checked')).toBe('false');
      fireEvent.click(toggle);
      expect(onUnreadOnlyChange).toHaveBeenCalledWith(true);
   });
});
