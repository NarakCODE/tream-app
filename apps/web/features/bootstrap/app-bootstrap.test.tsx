import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppBootstrap } from './app-bootstrap';

const mocks = vi.hoisted(() => ({ activeId: 'a', nextStep: 'DONE', replace: vi.fn() }));
const router = { replace: mocks.replace };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('./hooks', () => ({
   useBootstrap: () => ({
      isSuccess: true,
      isError: false,
      data: {
         user: { emailVerified: true },
         activeWorkspace: { workspaceId: mocks.activeId },
         onboarding: { nextStep: mocks.nextStep },
      },
   }),
}));
vi.mock('@repo/ui/splash-screen', () => ({
   SplashScreen: ({ label }: { label: string }) => <p role="status">{label}</p>,
}));
afterEach(() => {
   cleanup();
   vi.clearAllMocks();
   mocks.activeId = 'a';
   mocks.nextStep = 'DONE';
});

it('allows another route to select its workspace, then gates incomplete setup from refreshed bootstrap', async () => {
   const view = render(
      <AppBootstrap requireOnboardingWorkspaceId="b">
         <button>Workspace content</button>
      </AppBootstrap>
   );
   expect(screen.getByRole('button')).toBeTruthy();
   expect(mocks.replace).not.toHaveBeenCalled();
   mocks.activeId = 'b';
   mocks.nextStep = 'INVITE_TEAMMATES';
   view.rerender(
      <AppBootstrap requireOnboardingWorkspaceId="b">
         <button>Workspace content</button>
      </AppBootstrap>
   );
   await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/onboarding'));
   expect(screen.queryByRole('button')).toBeNull();
   expect(screen.getByRole('status').textContent).toBe('Opening your setup…');
});

it('opens completed target workspaces without redirecting', () => {
   mocks.activeId = 'b';
   render(
      <AppBootstrap requireOnboardingWorkspaceId="b">
         <button>Workspace content</button>
      </AppBootstrap>
   );
   expect(screen.getByRole('button')).toBeTruthy();
   expect(mocks.replace).not.toHaveBeenCalled();
});

it('does not gate workspace management when no target is required', () => {
   mocks.nextStep = 'INVITE_TEAMMATES';
   render(
      <AppBootstrap>
         <button>Create workspace</button>
      </AppBootstrap>
   );
   expect(screen.getByRole('button')).toBeTruthy();
   expect(mocks.replace).not.toHaveBeenCalled();
});
