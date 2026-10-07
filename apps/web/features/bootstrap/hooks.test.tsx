import { type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { BootstrapResponse } from '@repo/schemas';
import { useCompleteOnboarding } from './hooks';
import { bootstrapKeys, bootstrapQueryOptions } from './queries';
import { authKeys } from '@/features/auth/queries';

const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { post: mocks.post } }));
afterEach(cleanup);

function setup() {
   const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
   const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
   );
   return { client, wrapper };
}

const pending = {
   user: { id: 'user' },
   activeWorkspace: null,
   onboarding: {
      setupReady: true,
      completed: false,
      completedAt: null,
      nextStep: 'INVITE_TEAMMATES',
   },
} as BootstrapResponse;

it('keeps onboarding incomplete after a network failure and reuses the command key on retry', async () => {
   const { client, wrapper } = setup();
   client.setQueryData(bootstrapKeys.status(), pending);
   const done = {
      ...pending,
      onboarding: {
         ...pending.onboarding,
         completed: true,
         completedAt: '2026-10-07T00:00:00.000Z',
         nextStep: 'DONE' as const,
      },
   };
   mocks.post.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ data: done });
   const { result } = renderHook(() => useCompleteOnboarding('workspace'), { wrapper });
   const key = crypto.randomUUID();
   await act(async () => {
      await expect(result.current.mutateAsync(key)).rejects.toThrow('Offline');
   });
   expect(client.getQueryData(bootstrapKeys.status())).toEqual(pending);
   await act(async () => {
      await result.current.mutateAsync(key);
   });
   expect(mocks.post.mock.calls.map((call) => call[3].headers['Idempotency-Key'])).toEqual([
      key,
      key,
   ]);
   expect(client.getQueryData(bootstrapKeys.status())).toEqual(done);
   expect(client.getQueryData(authKeys.currentUser())).toEqual(done.user);
   expect(client.getQueryData(authKeys.activeWorkspace())).toBeNull();
});

it('fetches bootstrap without shared HTTP caching and with a bounded positive stale time', async () => {
   const get = vi.fn().mockResolvedValue({ data: pending });
   const { client } = setup();
   const options = bootstrapQueryOptions({ get } as unknown as Parameters<
      typeof bootstrapQueryOptions
   >[0]);
   await client.fetchQuery(options);
   expect(options.staleTime).toBeGreaterThan(0);
   expect(get).toHaveBeenCalledWith(
      '/api/v1/bootstrap',
      expect.anything(),
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) })
   );
});
