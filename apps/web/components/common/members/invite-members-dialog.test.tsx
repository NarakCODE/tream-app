import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InviteMembersDialog } from './invite-members-dialog';
import { authKeys } from '@/features/auth/queries';

const mockApi = vi.hoisted(() => ({
   post: vi.fn(),
   get: vi.fn(),
   patch: vi.fn(),
   delete: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
   api: mockApi,
}));

const mockToast = vi.hoisted(() => ({
   success: vi.fn(),
   error: vi.fn(),
}));

vi.mock('sonner', () => ({
   toast: mockToast,
}));

beforeEach(() => {
   vi.clearAllMocks();
});

afterEach(cleanup);

function renderWithClient(ui: React.ReactNode, role = 'OWNER') {
   const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
   });
   client.setQueryData(authKeys.activeWorkspace(), {
      workspaceId: 'ws-123',
      workspace: { id: 'ws-123', slug: 'test-org', name: 'Test Org' },
      membership: { id: 'mem-1', role },
   });
   client.setQueryData(authKeys.currentUser(), {
      id: 'user-1',
      email: 'owner@example.com',
      fullName: 'Workspace Owner',
   });
   return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

describe('InviteMembersDialog', () => {
   it('renders trigger button and opens dialog on click', async () => {
      renderWithClient(<InviteMembersDialog />);

      const inviteBtn = screen.getByRole('button', { name: 'Invite' });
      expect(inviteBtn).toBeTruthy();

      fireEvent.click(inviteBtn);

      expect(await screen.findByText('Invite people to workspace')).toBeTruthy();
      expect(screen.getByLabelText(/^Email/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Send invitation' })).toBeTruthy();
   });

   it('validates email addresses before sending', async () => {
      renderWithClient(<InviteMembersDialog />);

      fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

      const emailInput = await screen.findByLabelText(/^Email/i);
      fireEvent.change(emailInput, { target: { value: 'not-an-email' } });

      const submitBtn = screen.getByRole('button', { name: 'Send invitation' });
      fireEvent.click(submitBtn);

      expect(await screen.findByText('"not-an-email" is not a valid email address.')).toBeTruthy();
      expect(mockApi.post).not.toHaveBeenCalled();
   });

   it('successfully sends invitation and closes dialog', async () => {
      mockApi.post.mockResolvedValue({
         data: {
            id: 'inv-1',
            workspaceId: 'ws-123',
            email: 'newbie@example.com',
            role: 'MEMBER',
            invitedBy: 'user-1',
            expiresAt: '2026-12-31T00:00:00Z',
            acceptedBy: null,
            acceptedAt: null,
            revokedAt: null,
            createdAt: '2026-10-06T00:00:00Z',
         },
      });

      renderWithClient(<InviteMembersDialog />);

      fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

      const emailInput = await screen.findByLabelText(/^Email/i);
      fireEvent.change(emailInput, { target: { value: 'newbie@example.com' } });

      const submitBtn = screen.getByRole('button', { name: 'Send invitation' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
         expect(mockApi.post).toHaveBeenCalledWith(
            expect.stringContaining('/workspaces/ws-123/invitations'),
            expect.anything(),
            expect.objectContaining({
               email: 'newbie@example.com',
               role: 'MEMBER',
            }),
            expect.objectContaining({
               headers: expect.objectContaining({
                  'Idempotency-Key': expect.any(String),
               }),
            })
         );
         expect(mockToast.success).toHaveBeenCalledWith('Invitation sent to newbie@example.com.');
      });
   });

   it('displays error if member lacks invite permission', async () => {
      // Role GUEST does not have membership.invite permission
      renderWithClient(<InviteMembersDialog />, 'GUEST');

      fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

      expect(
         await screen.findByText(/You do not have permission to invite members/i)
      ).toBeTruthy();

      const submitBtn = screen.getByRole('button', { name: 'Send invitation' });
      expect(submitBtn.hasAttribute('disabled')).toBe(true);
   });
});
