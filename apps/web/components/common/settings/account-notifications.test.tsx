import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountNotifications from './account-notifications';
import { authKeys } from '@/features/auth/queries';

const mockApi = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: mockApi }));

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

describe('AccountNotifications', () => {
   it('renders workspace notification channel toggles and allows updating them', async () => {
      mockApi.get.mockImplementation((url: string) => {
         if (url.includes('/preferences')) {
            return Promise.resolve({
               data: { inAppEnabled: true, emailEnabled: false, revision: 1 },
            });
         }
         return Promise.reject(new Error(`Unhandled get url: ${url}`));
      });

      mockApi.patch.mockResolvedValue({
         data: { inAppEnabled: true, emailEnabled: true, revision: 2 },
      });

      renderWithClient(<AccountNotifications />);

      expect(
         await screen.findByText(/Notifications appear in your workspace inbox/i)
      ).toBeTruthy();
      expect(screen.getByText(/Email delivery jobs are suppressed/i)).toBeTruthy();

      const switches = screen.getAllByRole('switch');
      // The first switch is In-app, second is Email
      const inAppSwitch = switches[0]!;
      const emailSwitch = switches[1]!;

      expect(inAppSwitch.getAttribute('aria-checked')).toBe('true');
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

   it('shows error state when preference query fails', async () => {
      mockApi.get.mockRejectedValue(new Error('Network error'));

      renderWithClient(<AccountNotifications />);

      expect(await screen.findByText('Unable to load preferences from server.')).toBeTruthy();
   });
});
