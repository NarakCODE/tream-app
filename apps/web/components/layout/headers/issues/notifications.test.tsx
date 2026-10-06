import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Notifications from './notifications';
import { authKeys } from '@/features/auth/queries';

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
   client.setQueryData(authKeys.activeWorkspace(), {
      workspaceId: 'ws-1',
      workspace: { id: 'ws-1', slug: 'test-org', name: 'Test Org' },
      membership: { id: 'mem-1', role: 'MEMBER' },
   });
   client.setQueryData(authKeys.currentUser(), {
      id: 'user-1',
      email: 'test@example.com',
      fullName: 'Test User',
   });
   return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

describe('Header Notifications popover', () => {
   it('renders bell button and shows unread badge when unreadCount > 0', async () => {
      mockApi.get.mockImplementation((url: string) => {
         if (url.includes('/unread-count')) {
            return Promise.resolve({
               data: { unreadCount: 3 },
            });
         }
         if (url.includes('/preferences')) {
            return Promise.resolve({
               data: { inAppEnabled: true, emailEnabled: false },
            });
         }
         return Promise.resolve({
            data: [],
            meta: { total: 0, limit: 5, hasNext: false },
         });
      });

      renderWithClient(<Notifications />);

      const bell = await screen.findByRole('button', { name: /3 unread notifications/i });
      expect(bell).toBeTruthy();
   });

   it('opens popover and allows toggling channel preferences', async () => {
      mockApi.get.mockImplementation((url: string) => {
         if (url.includes('/unread-count')) {
            return Promise.resolve({
               data: { unreadCount: 0 },
            });
         }
         if (url.includes('/preferences')) {
            return Promise.resolve({
               data: { inAppEnabled: true, emailEnabled: false, revision: 1 },
            });
         }
         return Promise.resolve({
            data: [],
            meta: { total: 0, limit: 5, hasNext: false },
         });
      });

      mockApi.patch.mockResolvedValue({
         data: { inAppEnabled: true, emailEnabled: true, revision: 2 },
      });

      renderWithClient(<Notifications />);

      const bell = await screen.findByRole('button', { name: 'Notifications' });
      fireEvent.click(bell);

      expect(await screen.findByText('All caught up')).toBeTruthy();

      // Open settings inside popover
      const settingsBtn = screen.getByRole('button', { name: 'Notification channels' });
      fireEvent.click(settingsBtn);

      const emailSwitch = await screen.findByRole('switch', { name: 'Email notifications' });
      expect(emailSwitch.getAttribute('aria-checked')).toBe('false');

      fireEvent.click(emailSwitch);

      await waitFor(() => {
         expect(mockApi.patch).toHaveBeenCalledWith(
            expect.stringContaining('/notifications/preferences'),
            expect.anything(),
            expect.objectContaining({ emailEnabled: true }),
            expect.anything()
         );
      });
   });
});
