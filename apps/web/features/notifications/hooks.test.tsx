import React, { type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@repo/api-client';
import {
   notificationPreferencesSchema,
   notificationSnoozeInputSchema,
   type Notification,
} from '@repo/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationKeys } from './queries';
import {
   useChangeNotification,
   useNotificationList,
   useUnreadCount,
   useUpdateNotificationPreferences,
   useNotificationPreferences,
} from './hooks';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get: mocks.get, patch: mocks.patch, post: mocks.post } }));
vi.mock('sonner', () => ({ toast: { error: mocks.toast, info: mocks.toast, success: vi.fn() } }));

const workspace = 'workspace';
const user = 'user';
const filters = { status: 'inbox' as const, limit: 25 };
const timestamp = '2026-01-01T00:00:00.000Z';
const item = (id = 'notification'): Notification => ({
   id,
   workspaceId: workspace,
   recipientMembershipId: 'recipient',
   actorMembershipId: null,
   eventId: 'event',
   kind: 'ASSIGNMENT',
   issueId: 'issue',
   projectId: null,
   initiativeId: null,
   documentId: null,
   revision: 1,
   readAt: null,
   archivedAt: null,
   snoozedUntil: null,
   createdAt: timestamp,
   updatedAt: timestamp,
});
const page = (items: Notification[]) => ({
   paginationType: 'cursor' as const,
   items,
   total: items.length,
   limit: 25,
   cursor: null,
   hasNext: false,
   nextCursor: null,
});
const envelope = (data: unknown) => ({ data, meta: {} });
const error = (status: number) => new ApiError({ status, code: 'TEST', message: 'Request failed' });
function setup(items = [item()]) {
   const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
   });
   client.setQueryData(notificationKeys.list(workspace, user, filters), {
      pages: [page(items)],
      pageParams: [undefined],
   });
   client.setQueryData(notificationKeys.unreadCount(workspace, user), {
      unreadCount: items.length,
   });
   const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
   );
   return { client, wrapper };
}
function cached(client: QueryClient, queryFilters = filters) {
   return client.getQueryData<{ pages: ReturnType<typeof page>[] }>(
      notificationKeys.list(workspace, user, queryFilters)
   )!;
}
function deferred<T>() {
   let resolve!: (value: T) => void;
   let reject!: (reason: unknown) => void;
   const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
   });
   return { promise, resolve, reject };
}
beforeEach(() => {
   vi.resetAllMocks();
});
afterEach(() => {
   cleanup();
});

describe('mounted notification hooks', () => {
   it.each([408, 500, 502])(
      'keeps an ambiguous HTTP %i command key for an identical explicit retry',
      async (status) => {
         const { wrapper } = setup();
         mocks.patch
            .mockRejectedValueOnce(error(status))
            .mockResolvedValueOnce(envelope({ ...item(), revision: 2, readAt: timestamp }));
         const { result } = renderHook(() => useChangeNotification(workspace, user), { wrapper });
         act(() =>
            result.current.mutate({ notification: item(), change: { type: 'read', read: true } })
         );
         await waitFor(() => expect(result.current.isError).toBe(true));
         expect(mocks.patch).toHaveBeenCalledTimes(1);
         act(() =>
            result.current.mutate({ notification: item(), change: { type: 'read', read: true } })
         );
         await waitFor(() => expect(result.current.isSuccess).toBe(true));
         expect(mocks.patch.mock.calls[1][3].headers['Idempotency-Key']).toBe(
            mocks.patch.mock.calls[0][3].headers['Idempotency-Key']
         );
      }
   );
   it('sends the highest cached revision when the detail query is older than a loaded list', async () => {
      const newest = { ...item(), revision: 7 };
      const { client, wrapper } = setup([newest]);
      client.setQueryData(notificationKeys.detail(workspace, user, 'notification'), {
         ...item(),
         revision: 2,
      });
      mocks.patch.mockResolvedValue(envelope({ ...newest, revision: 8, readAt: timestamp }));
      const { result } = renderHook(() => useChangeNotification(workspace, user), { wrapper });
      act(() =>
         result.current.mutate({ notification: item(), change: { type: 'read', read: true } })
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mocks.patch.mock.calls[0][2]).toEqual({ expectedRevision: 7, read: true });
   });
   it('defers preference-settled list and count refresh while another change is optimistic', async () => {
      const { client, wrapper } = setup();
      const preferences = {
         workspaceId: workspace,
         recipientMembershipId: 'recipient',
         inAppEnabled: true,
         emailEnabled: false,
         revision: 1,
      };
      const changeRequest = deferred<unknown>();
      mocks.patch.mockImplementation((url: string) =>
         url.endsWith('/preferences')
            ? Promise.resolve(envelope({ ...preferences, emailEnabled: true, revision: 2 }))
            : changeRequest.promise
      );
      const invalidation = vi.spyOn(client, 'invalidateQueries');
      const { result } = renderHook(
         () => ({
            change: useChangeNotification(workspace, user),
            preferences: useUpdateNotificationPreferences(workspace, user),
         }),
         { wrapper }
      );
      act(() =>
         result.current.change.mutate({
            notification: item(),
            change: { type: 'read', read: true },
         })
      );
      await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
      act(() => result.current.preferences.mutate({ preferences, patch: { emailEnabled: true } }));
      await waitFor(() => expect(result.current.preferences.isSuccess).toBe(true));
      const inboxRefreshes = () =>
         invalidation.mock.calls.filter(([options]) =>
            ['list', 'unread-count'].includes(String(options?.queryKey?.[3]))
         );
      expect(inboxRefreshes()).toHaveLength(0);
      await act(async () =>
         changeRequest.resolve(envelope({ ...item(), revision: 2, readAt: timestamp }))
      );
      await waitFor(() => expect(result.current.change.isSuccess).toBe(true));
      expect(inboxRefreshes()).toHaveLength(2);
   });
   it('creates preference channels using the default revision zero', async () => {
      const { client, wrapper } = setup();
      const preferences = {
         workspaceId: workspace,
         recipientMembershipId: 'recipient',
         inAppEnabled: true,
         emailEnabled: false,
         revision: 0,
      };
      mocks.patch.mockResolvedValue(envelope({ ...preferences, revision: 1, emailEnabled: true }));
      const { result } = renderHook(() => useUpdateNotificationPreferences(workspace, user), {
         wrapper,
      });
      act(() => result.current.mutate({ preferences, patch: { emailEnabled: true } }));
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mocks.patch.mock.calls[0][2]).toEqual({ expectedRevision: 0, emailEnabled: true });
      expect(client.getQueryData(notificationKeys.preferences(workspace, user))).toMatchObject({
         revision: 1,
         emailEnabled: true,
      });
   });
   it('refetches preference conflicts without retrying the patch', async () => {
      const { client, wrapper } = setup();
      const preferences = {
         workspaceId: workspace,
         recipientMembershipId: 'recipient',
         inAppEnabled: true,
         emailEnabled: false,
         revision: 1,
      };
      client.setQueryData(notificationKeys.preferences(workspace, user), preferences);
      mocks.patch.mockRejectedValue(error(409));
      mocks.get.mockImplementation(async (url: string) =>
         url.endsWith('/preferences')
            ? envelope({ ...preferences, revision: 2, emailEnabled: true })
            : envelope({ unreadCount: 1 })
      );
      const { result } = renderHook(
         () => ({
            query: useNotificationPreferences(workspace, user),
            change: useUpdateNotificationPreferences(workspace, user),
         }),
         { wrapper }
      );
      act(() => result.current.change.mutate({ preferences, patch: { emailEnabled: true } }));
      await waitFor(() => expect(result.current.change.isError).toBe(true));
      expect(result.current.query.data).toMatchObject({ revision: 2, emailEnabled: true });
      expect(mocks.patch).toHaveBeenCalledTimes(1);
      expect(mocks.toast).toHaveBeenCalledWith(expect.stringMatching(/preferences changed/i));
   });
   it('preserves the idempotency key for an identical uncertain command and sends the cached revision', async () => {
      const { client, wrapper } = setup();
      client.setQueryData(notificationKeys.detail(workspace, user, 'notification'), {
         ...item(),
         revision: 4,
      });
      mocks.patch
         .mockRejectedValueOnce(new Error('Connection lost'))
         .mockResolvedValueOnce(envelope({ ...item(), revision: 5, readAt: timestamp }));
      const { result } = renderHook(() => useChangeNotification(workspace, user), { wrapper });
      act(() =>
         result.current.mutate({ notification: item(), change: { type: 'read', read: true } })
      );
      await waitFor(() => expect(result.current.isError).toBe(true));
      act(() =>
         result.current.mutate({ notification: item(), change: { type: 'read', read: true } })
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const first = mocks.patch.mock.calls[0];
      const second = mocks.patch.mock.calls[1];
      expect(first[2]).toEqual({ expectedRevision: 4, read: true });
      expect(second[2]).toEqual(first[2]);
      expect(second[3].headers['Idempotency-Key']).toBe(first[3].headers['Idempotency-Key']);
   });
   it('rolls back a 409, fetches the canonical revision and never retries the command', async () => {
      const { client, wrapper } = setup();
      const canonical = { ...item(), revision: 2 };
      const request = deferred<unknown>();
      mocks.patch.mockReturnValue(request.promise);
      mocks.get.mockResolvedValue(envelope(canonical));
      const { result } = renderHook(() => useChangeNotification(workspace, user), { wrapper });
      act(() =>
         result.current.mutate({ notification: item(), change: { type: 'read', read: true } })
      );
      await waitFor(() => expect(cached(client).pages[0].items[0].readAt).not.toBeNull());
      await act(async () => {
         request.reject(error(409));
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(mocks.patch).toHaveBeenCalledTimes(1);
      expect(mocks.get).toHaveBeenCalledWith(
         expect.stringContaining('/notification'),
         expect.anything(),
         expect.anything()
      );
      expect(cached(client).pages[0].items[0]).toMatchObject({ revision: 2, readAt: null });
      expect(mocks.toast).toHaveBeenCalledWith(expect.stringMatching(/changed/i));
   });

   it('quietly removes a missing notification from every cached page', async () => {
      const { client, wrapper } = setup();
      client.setQueryData(notificationKeys.detail(workspace, user, 'notification'), item());
      mocks.patch.mockRejectedValue(error(404));
      const { result } = renderHook(() => useChangeNotification(workspace, user), { wrapper });
      act(() =>
         result.current.mutate({
            notification: item(),
            change: { type: 'archive', archived: true },
         })
      );
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(cached(client).pages[0].items).toEqual([]);
      expect(
         client.getQueryData(notificationKeys.detail(workspace, user, 'notification'))
      ).toBeUndefined();
      expect(mocks.toast).not.toHaveBeenCalled();
   });

   it('hides stale rows and returns zero count when in-app notifications are disabled', async () => {
      const { client, wrapper } = setup();
      client.setQueryData(notificationKeys.preferences(workspace, user), {
         workspaceId: workspace,
         recipientMembershipId: 'recipient',
         inAppEnabled: false,
         emailEnabled: false,
         revision: 1,
      });
      const { result } = renderHook(
         () => ({
            list: useNotificationList(workspace, user, filters),
            count: useUnreadCount(workspace, user),
         }),
         { wrapper }
      );
      await waitFor(() =>
         expect(result.current.list.data?.pages.flatMap((p) => p.items)).toEqual([])
      );
      expect(result.current.count.data?.unreadCount).toBe(0);
      expect(mocks.get).not.toHaveBeenCalled();
   });

   it('rolls back only its own row when another row changes concurrently', async () => {
      const first = item('first');
      const second = item('second');
      const { client, wrapper } = setup([first, second]);
      const failing = deferred<unknown>();
      const successful = deferred<unknown>();
      mocks.patch.mockImplementation((url: string) =>
         url.includes('/first/') ? failing.promise : successful.promise
      );
      const a = renderHook(() => useChangeNotification(workspace, user), { wrapper });
      const b = renderHook(() => useChangeNotification(workspace, user), { wrapper });
      act(() => {
         a.result.current.mutate({ notification: first, change: { type: 'read', read: true } });
         b.result.current.mutate({ notification: second, change: { type: 'read', read: true } });
      });
      await waitFor(() =>
         expect(cached(client).pages[0].items.every((n) => n.readAt !== null)).toBe(true)
      );
      await act(async () => {
         successful.resolve(envelope({ ...second, readAt: timestamp, revision: 2 }));
      });
      await act(async () => {
         failing.reject(error(500));
      });
      await waitFor(() => expect(a.result.current.isError).toBe(true));
      expect(cached(client).pages[0].items.find((n) => n.id === 'first')?.readAt).toBeNull();
      expect(cached(client).pages[0].items.find((n) => n.id === 'second')).toMatchObject({
         readAt: timestamp,
         revision: 2,
      });
   });
});

describe('notification input contracts', () => {
   it('accepts default revision-zero preferences without persisted row fields', () => {
      expect(
         notificationPreferencesSchema.parse({
            workspaceId: workspace,
            recipientMembershipId: 'recipient',
            inAppEnabled: true,
            emailEnabled: false,
            revision: 0,
         }).revision
      ).toBe(0);
   });
   it('accepts unsnooze and rejects past or more-than-90-day snoozes', () => {
      expect(
         notificationSnoozeInputSchema.parse({ expectedRevision: 1, snoozedUntil: null })
            .snoozedUntil
      ).toBeNull();
      expect(
         notificationSnoozeInputSchema.safeParse({
            expectedRevision: 1,
            snoozedUntil: new Date(Date.now() - 1000).toISOString(),
         }).success
      ).toBe(false);
      expect(
         notificationSnoozeInputSchema.safeParse({
            expectedRevision: 1,
            snoozedUntil: new Date(Date.now() + 91 * 86400000).toISOString(),
         }).success
      ).toBe(false);
   });
});
