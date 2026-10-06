'use client';

import { useEffect } from 'react';
import {
   useInfiniteQuery,
   useMutation,
   useMutationState,
   useQuery,
   useQueryClient,
   type QueryClient,
} from '@tanstack/react-query';
import { ApiError } from '@repo/api-client';
import type { Notification, NotificationPreferences, NotificationRetryInput } from '@repo/schemas';
import { notificationSnoozeInputSchema } from '@repo/schemas';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { notificationsApi } from './api';
import {
   notificationKeys,
   notificationListQueryOptions,
   notificationPreferencesQueryOptions,
   unreadCountQueryOptions,
   notificationDetailQueryOptions,
   notificationActorQueryOptions,
   notificationDeliveriesQueryOptions,
   notificationTargetQueryOptions,
   type NotificationFilters,
} from './queries';
import {
   cachedNotification,
   optimisticNotification,
   patchNotification,
   rollbackNotification,
   removeNotification,
   removeTargetNotifications,
   removalGeneration,
   type NotificationSnapshot,
} from './cache';

const isStatus = (error: unknown, status: number) =>
   error instanceof ApiError && error.status === status;
const isDefiniteRejection = (error: unknown) =>
   error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408;
const attempts = new WeakMap<QueryClient, Map<string, string>>();
const locks = new WeakMap<QueryClient, Set<string>>();
function attempt(client: QueryClient, identity: string) {
   let entries = attempts.get(client);
   if (!entries) {
      entries = new Map();
      attempts.set(client, entries);
   }
   if (!entries.has(identity)) entries.set(identity, crypto.randomUUID());
   return entries.get(identity)!;
}
function forgetAttempt(client: QueryClient, identity: string) {
   attempts.get(client)?.delete(identity);
}
function acquire(client: QueryClient, key: string) {
   let entries = locks.get(client);
   if (!entries) {
      entries = new Set();
      locks.set(client, entries);
   }
   if (entries.has(key)) throw new PendingNotificationError();
   entries.add(key);
}
class PendingNotificationError extends Error {
   constructor() {
      super('This notification is being updated.');
   }
}
async function refreshInbox(client: QueryClient, w: string, u: string) {
   if (client.isMutating({ mutationKey: notificationKeys.scope(w, u) }) > 1) return;
   await Promise.all([
      client.invalidateQueries({ queryKey: notificationKeys.lists(w, u) }),
      client.invalidateQueries({ queryKey: notificationKeys.unreadCount(w, u) }),
   ]);
}

export function useNotificationPreferences(w: string, u: string) {
   return useQuery(notificationPreferencesQueryOptions(api, w, u));
}
export function useNotificationList(w: string, u: string, filters: NotificationFilters) {
   const client = useQueryClient();
   const prefs = useNotificationPreferences(w, u);
   const result = useInfiniteQuery({
      ...notificationListQueryOptions(api, w, u, filters),
      enabled: Boolean(w && u && prefs.isSuccess && prefs.data.inAppEnabled),
   });
   const pages = result.data?.pages;
   useEffect(() => {
      const until = pages
         ?.flatMap((page) => page.items)
         .map((item) => (item.snoozedUntil ? Date.parse(item.snoozedUntil) : 0))
         .filter((value) => value > Date.now());
      if (!until?.length) return;
      const timeout = setTimeout(
         () => {
            if (client.isMutating({ mutationKey: notificationKeys.scope(w, u) }) === 0)
               void refreshInbox(client, w, u);
         },
         Math.min(2147483647, Math.max(100, Math.min(...until) - Date.now() + 100))
      );
      return () => clearTimeout(timeout);
   }, [client, w, u, pages]);
   if (prefs.data?.inAppEnabled === false)
      return {
         ...result,
         data: result.data
            ? {
                 ...result.data,
                 pages: result.data.pages.map((page) => ({
                    ...page,
                    items: [],
                    total: 0,
                    hasNext: false,
                    nextCursor: null,
                 })),
              }
            : undefined,
         hasNextPage: false,
      };
   return result;
}
export function useUnreadCount(w: string, u: string) {
   const prefs = useNotificationPreferences(w, u);
   const result = useQuery({
      ...unreadCountQueryOptions(api, w, u),
      enabled: Boolean(w && u && prefs.isSuccess && prefs.data.inAppEnabled),
   });
   return prefs.data?.inAppEnabled === false ? { ...result, data: { unreadCount: 0 } } : result;
}
export function useNotificationDetail(w: string, u: string, id: string) {
   const client = useQueryClient();
   const result = useQuery(notificationDetailQueryOptions(api, w, u, id));
   useEffect(() => {
      if (isStatus(result.error, 404)) removeNotification(client, w, u, id);
   }, [client, w, u, id, result.error]);
   return result;
}
export function useNotificationActor(w: string, u: string, id: string) {
   const client = useQueryClient();
   const result = useQuery(notificationActorQueryOptions(api, w, u, id));
   useEffect(() => {
      if (isStatus(result.error, 404)) removeNotification(client, w, u, id);
   }, [client, w, u, id, result.error]);
   return result;
}
export function useNotificationTarget(w: string, u: string, notification: Notification) {
   const client = useQueryClient();
   const result = useQuery(notificationTargetQueryOptions(api, w, u, notification));
   useEffect(() => {
      if (isStatus(result.error, 404)) removeTargetNotifications(client, w, u, notification);
   }, [client, w, u, notification, result.error]);
   return isStatus(result.error, 404) ? { ...result, data: undefined } : result;
}
export function useNotificationDeliveries(w: string, u: string, id: string, enabled = true) {
   return useQuery({
      ...notificationDeliveriesQueryOptions(api, w, u, id),
      enabled: Boolean(w && u && id && enabled),
   });
}
export function useNotificationPending(w: string, u: string, id: string) {
   const pending = useMutationState({
      filters: { mutationKey: notificationKeys.scope(w, u), status: 'pending' },
      select: (mutation) => {
         const variables = mutation.state.variables as { notification?: Notification } | undefined;
         return variables?.notification?.id === id;
      },
   });
   return pending.some(Boolean);
}
export type NotificationChange =
   | { type: 'read'; read: boolean }
   | { type: 'archive'; archived: boolean }
   | { type: 'snooze'; snoozedUntil: string | null };
type ChangeVariables = { notification: Notification; change: NotificationChange; key?: string };
type ChangeContext = {
   before: Notification;
   snapshot: NotificationSnapshot;
   identity: string;
   lock: string;
};
const commandIdentity = (w: string, u: string, v: ChangeVariables) =>
   JSON.stringify([w, u, v.notification.id, v.notification.revision, v.change]);

export function useChangeNotification(w: string, u: string) {
   const client = useQueryClient();
   return useMutation<Notification, Error, ChangeVariables, ChangeContext>({
      mutationKey: [...notificationKeys.scope(w, u), 'change'],
      retry: false,
      onMutate: async (variables) => {
         const lock = JSON.stringify([w, u, variables.notification.id]);
         acquire(client, lock);
         try {
            await Promise.all([
               client.cancelQueries({ queryKey: notificationKeys.lists(w, u) }),
               client.cancelQueries({
                  queryKey: notificationKeys.detail(w, u, variables.notification.id),
               }),
               client.cancelQueries({ queryKey: notificationKeys.unreadCount(w, u) }),
            ]);
            const before =
               cachedNotification(client, w, u, variables.notification.id) ??
               variables.notification;
            variables.notification = before;
            const change = variables.change;
            if (change.type === 'snooze')
               notificationSnoozeInputSchema.parse({
                  expectedRevision: before.revision,
                  snoozedUntil: change.snoozedUntil,
               });
            const after = {
               ...before,
               ...(change.type === 'read'
                  ? { readAt: change.read ? new Date().toISOString() : null }
                  : change.type === 'archive'
                    ? { archivedAt: change.archived ? new Date().toISOString() : null }
                    : { snoozedUntil: change.snoozedUntil }),
            };
            const identity = commandIdentity(w, u, variables);
            variables.key = attempt(client, identity);
            return {
               before,
               snapshot: optimisticNotification(client, w, u, before, after),
               identity,
               lock,
            };
         } catch (error) {
            locks.get(client)?.delete(lock);
            throw error;
         }
      },
      mutationFn: (variables) => {
         const { notification, change } = variables;
         const key = variables.key!;
         if (change.type === 'read')
            return notificationsApi.read(
               api,
               w,
               notification.id,
               { expectedRevision: notification.revision, read: change.read },
               key
            );
         if (change.type === 'archive')
            return notificationsApi.archive(
               api,
               w,
               notification.id,
               { expectedRevision: notification.revision, archived: change.archived },
               key
            );
         return notificationsApi.snooze(
            api,
            w,
            notification.id,
            { expectedRevision: notification.revision, snoozedUntil: change.snoozedUntil },
            key
         );
      },
      onSuccess: (item, _variables, context) => {
         forgetAttempt(client, context.identity);
         if (removalGeneration(client, w, u, item.id) === context.snapshot.removalGeneration)
            patchNotification(client, w, u, item);
      },
      onError: async (error, variables, context) => {
         if (context) {
            rollbackNotification(client, w, u, context.before, context.snapshot);
            if (isDefiniteRejection(error)) forgetAttempt(client, context.identity);
         }
         if (isStatus(error, 404)) {
            removeNotification(client, w, u, variables.notification.id);
            return;
         }
         if (isStatus(error, 409)) {
            try {
               patchNotification(
                  client,
                  w,
                  u,
                  await client.fetchQuery({
                     ...notificationDetailQueryOptions(api, w, u, variables.notification.id),
                     staleTime: 0,
                  })
               );
            } catch (currentError) {
               if (isStatus(currentError, 404))
                  removeNotification(client, w, u, variables.notification.id);
            }
            toast.error('This notification changed. Please try again.');
         } else if (!(error instanceof PendingNotificationError))
            toast.error(error.message || 'Could not update this notification.');
      },
      onSettled: async (_data, _error, _variables, context) => {
         if (context) locks.get(client)?.delete(context.lock);
         if (client.isMutating({ mutationKey: [...notificationKeys.scope(w, u), 'change'] }) <= 1)
            await refreshInbox(client, w, u);
      },
   });
}
export function useUpdateNotificationPreferences(w: string, u: string) {
   const client = useQueryClient();
   return useMutation({
      mutationKey: [...notificationKeys.scope(w, u), 'preferences-update'],
      retry: false,
      mutationFn: ({
         preferences,
         patch,
      }: {
         preferences: NotificationPreferences;
         patch: Pick<Partial<NotificationPreferences>, 'inAppEnabled' | 'emailEnabled'>;
      }) => {
         const input = { expectedRevision: preferences.revision, ...patch };
         return notificationsApi.updatePreferences(
            api,
            w,
            input,
            attempt(client, JSON.stringify([w, u, 'preferences', input]))
         );
      },
      onSuccess: (preferences, variables) => {
         forgetAttempt(
            client,
            JSON.stringify([
               w,
               u,
               'preferences',
               { expectedRevision: variables.preferences.revision, ...variables.patch },
            ])
         );
         client.setQueryData(notificationKeys.preferences(w, u), preferences);
         if (!preferences.inAppEnabled) {
            client.setQueryData(notificationKeys.unreadCount(w, u), { unreadCount: 0 });
            client.removeQueries({ queryKey: notificationKeys.lists(w, u) });
         }
      },
      onError: async (error, variables) => {
         if (isDefiniteRejection(error))
            forgetAttempt(
               client,
               JSON.stringify([
                  w,
                  u,
                  'preferences',
                  { expectedRevision: variables.preferences.revision, ...variables.patch },
               ])
            );
         if (isStatus(error, 409)) {
            await client.invalidateQueries({ queryKey: notificationKeys.preferences(w, u) });
            toast.error('Your notification preferences changed. Please try again.');
         } else toast.error(error.message || 'Could not update notification preferences.');
      },
      onSettled: async () => {
         await refreshInbox(client, w, u);
         await client.invalidateQueries({
            queryKey: [...notificationKeys.scope(w, u), 'deliveries'],
         });
      },
   });
}
export function useRetryNotificationDelivery(w: string, u: string, id: string) {
   const client = useQueryClient();
   return useMutation({
      mutationKey: [...notificationKeys.scope(w, u), 'delivery-retry', id],
      retry: false,
      mutationFn: (input: NotificationRetryInput) =>
         notificationsApi.retryDelivery(
            api,
            w,
            id,
            input,
            attempt(client, JSON.stringify([w, u, id, 'retry', input]))
         ),
      onSuccess: (_data, input) => {
         forgetAttempt(client, JSON.stringify([w, u, id, 'retry', input]));
         toast.success('Email delivery queued.');
      },
      onError: (error, input) => {
         if (isDefiniteRejection(error))
            forgetAttempt(client, JSON.stringify([w, u, id, 'retry', input]));
         if (!isStatus(error, 404))
            toast.error(
               isStatus(error, 409)
                  ? 'Email settings or delivery status changed. Please review and try again.'
                  : error.message || 'Could not retry delivery.'
            );
      },
      onSettled: async () => {
         await Promise.all([
            client.invalidateQueries({ queryKey: notificationKeys.deliveries(w, u, id) }),
            client.invalidateQueries({ queryKey: notificationKeys.preferences(w, u) }),
            refreshInbox(client, w, u),
         ]);
      },
   });
}
