import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountSecurity from './account-security';

const mockApi = vi.hoisted(() => ({
   get: vi.fn(),
   post: vi.fn(),
   delete: vi.fn(),
}));

const mockGetCurrentSessionId = vi.hoisted(() => vi.fn());
const mockRouter = vi.hoisted(() => ({
   push: vi.fn(),
   refresh: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
   api: mockApi,
   getCurrentSessionId: mockGetCurrentSessionId,
   AUTH_COOKIE_NAME: 'tream_access',
   deleteClientCookie: vi.fn(),
}));

vi.mock('next/navigation', () => ({
   useRouter: () => mockRouter,
}));

vi.mock('sonner', () => ({
   toast: {
      success: vi.fn(),
      error: vi.fn(),
   },
}));

beforeEach(() => {
   vi.clearAllMocks();
   mockGetCurrentSessionId.mockReturnValue('session-current');
});

afterEach(cleanup);

function renderWithClient(ui: React.ReactNode) {
   const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
   });
   return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

describe('AccountSecurity', () => {
   it('renders loading state initially and then displays active sessions', async () => {
      mockApi.get.mockImplementation((url: string) => {
         if (url.includes('/auth/sessions')) {
            return Promise.resolve({
               data: [
                  { id: 'session-current', expiresAt: '2026-12-31T23:59:59.000Z' },
                  { id: 'session-remote-123', expiresAt: '2026-11-30T12:00:00.000Z' },
               ],
            });
         }
         return Promise.reject(new Error('Not found'));
      });

      renderWithClient(<AccountSecurity />);

      expect(screen.getByText('Loading sessions…')).toBeTruthy();

      expect(await screen.findByText('Current session')).toBeTruthy();
      expect(screen.getByText('Session session-')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Sign out all' })).toBeTruthy();

      // Placeholder sections are rendered with disabled buttons
      expect(
         screen.getByRole('button', { name: 'New passkey' }).hasAttribute('disabled')
      ).toBe(true);
      expect(
         screen.getByRole('button', { name: 'New API key' }).hasAttribute('disabled')
      ).toBe(true);
      expect(screen.getByRole('button', { name: 'Add key' }).hasAttribute('disabled')).toBe(true);
   });

   it('handles signing out of the current session', async () => {
      mockApi.get.mockResolvedValue({
         data: [{ id: 'session-current', expiresAt: '2026-12-31T23:59:59.000Z' }],
      });
      mockApi.post.mockResolvedValue({ data: { message: 'Logged out' } });

      renderWithClient(<AccountSecurity />);

      const signOutBtn = await screen.findByRole('button', { name: 'Sign out' });
      fireEvent.click(signOutBtn);

      await waitFor(() => {
         expect(mockApi.post).toHaveBeenCalledWith(
            '/api/v1/auth/logout',
            expect.anything(),
            expect.anything(),
            expect.anything()
         );
         expect(mockRouter.push).toHaveBeenCalledWith('/login');
      });
   });

   it('handles revoking a remote session', async () => {
      mockApi.get.mockResolvedValue({
         data: [
            { id: 'session-current', expiresAt: '2026-12-31T23:59:59.000Z' },
            { id: 'session-remote-123', expiresAt: '2026-11-30T12:00:00.000Z' },
         ],
      });
      mockApi.delete.mockResolvedValue({ data: { message: 'Session revoked' } });

      renderWithClient(<AccountSecurity />);

      const revokeBtn = await screen.findByRole('button', { name: 'Revoke' });
      fireEvent.click(revokeBtn);

      await waitFor(() => {
         expect(mockApi.delete).toHaveBeenCalledWith(
            expect.stringContaining('/api/v1/auth/sessions/session-remote-123'),
            expect.anything(),
            expect.anything()
         );
      });
   });

   it('handles signing out of all sessions', async () => {
      mockApi.get.mockResolvedValue({
         data: [{ id: 'session-current', expiresAt: '2026-12-31T23:59:59.000Z' }],
      });
      mockApi.post.mockResolvedValue({ data: { message: 'All sessions revoked' } });

      renderWithClient(<AccountSecurity />);

      const signOutAllBtn = await screen.findByRole('button', { name: 'Sign out all' });
      fireEvent.click(signOutAllBtn);

      await waitFor(() => {
         expect(mockApi.post).toHaveBeenCalledWith(
            '/api/v1/auth/logout-all',
            expect.anything(),
            expect.anything(),
            expect.anything()
         );
         expect(mockRouter.push).toHaveBeenCalledWith('/login');
      });
   });

   it('shows error state when fetching sessions fails', async () => {
      mockApi.get.mockRejectedValue(new Error('Failed to fetch sessions'));

      renderWithClient(<AccountSecurity />);

      expect(await screen.findByText('Unable to load sessions')).toBeTruthy();
      expect(screen.getByText('Failed to fetch sessions')).toBeTruthy();
   });
});
