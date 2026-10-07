import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Onboarding } from './onboarding';

const mocks = vi.hoisted(() => ({
   bootstrap: {} as Record<string, unknown>,
   complete: vi.fn(),
   replace: vi.fn(),
   select: vi.fn(),
}));
vi.mock('next/navigation', () => ({
   useRouter: () => ({ replace: mocks.replace, refresh: vi.fn() }),
}));
vi.mock('@/features/bootstrap/hooks', () => ({
   useBootstrap: () => mocks.bootstrap,
   useCompleteOnboarding: () => ({ mutateAsync: mocks.complete, isPending: false }),
}));
vi.mock('@/features/teams/hooks', () => ({
   useCreateTeam: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/features/workspaces/hooks', () => ({
   useSelectWorkspace: () => ({ mutateAsync: mocks.select, isPending: false }),
   useWorkspaceList: () => ({ data: { pages: [{ data: [{ id: 'ws', name: 'Existing' }] }] } }),
}));
vi.mock('@/features/workspaces/workspace-setup', () => ({
   WorkspaceSetup: () => <div>Create workspace form</div>,
}));
vi.mock('@/features/invitations/invitation-step', () => ({
   InvitationStep: ({ onContinue }: { onContinue: () => void }) => (
      <button onClick={onContinue}>Skip for now</button>
   ),
}));

function status(nextStep: string, role = 'OWNER') {
   mocks.bootstrap = {
      data: {
         user: { id: 'user' },
         activeWorkspace:
            nextStep === 'SELECT_WORKSPACE' || nextStep === 'CREATE_WORKSPACE'
               ? null
               : { workspace: { id: 'ws', name: 'Acme', slug: 'acme' }, membership: { role } },
         onboarding: { nextStep, setupReady: nextStep === 'INVITE_TEAMMATES', completed: false },
      },
      refetch: vi.fn(),
   };
}
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it('uses server readiness for guests without requiring any visible team', () => {
   status('INVITE_TEAMMATES', 'GUEST');
   render(<Onboarding />);
   expect(screen.getByRole('button', { name: 'Open workspace' })).toBeTruthy();
   expect(screen.queryByRole('heading', { name: 'Create your first team' })).toBeNull();
});

it('keeps failed completion reviewable and retries the same command before navigating', async () => {
   status('INVITE_TEAMMATES');
   mocks.complete
      .mockRejectedValueOnce(new Error('Connection failed'))
      .mockResolvedValueOnce({
         onboarding: { nextStep: 'DONE' },
         activeWorkspace: { workspaceId: 'ws', workspace: { slug: 'renamed' } },
      });
   render(<Onboarding />);
   fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
   await screen.findByRole('alert');
   expect(mocks.replace).not.toHaveBeenCalled();
   fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
   await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/renamed/my-issues'));
   expect(mocks.complete.mock.calls[0]?.[0]).toEqual(mocks.complete.mock.calls[1]?.[0]);
});

it('selects an existing membership instead of creating another workspace', async () => {
   status('SELECT_WORKSPACE');
   render(<Onboarding />);
   expect(screen.queryByText('Create workspace form')).toBeNull();
   fireEvent.click(screen.getByRole('button', { name: 'Existing' }));
   await waitFor(() =>
      expect(mocks.select).toHaveBeenCalledWith({ id: 'ws', key: expect.any(String) })
   );
});

it('does not navigate after completion when the selected workspace changed', async () => {
   status('INVITE_TEAMMATES');
   mocks.complete.mockResolvedValueOnce({
      onboarding: { nextStep: 'DONE' },
      activeWorkspace: { workspaceId: 'other', workspace: { slug: 'other' } },
   });
   render(<Onboarding />);
   fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
   expect((await screen.findByRole('alert')).textContent).toContain('Your setup changed');
   expect(mocks.replace).not.toHaveBeenCalled();
});
