import type { ApiClient } from '@repo/api-client';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import type { NotificationListQuery, Notification } from '@repo/schemas';
import { notificationsApi, targetOf } from './api';

export type NotificationFilters = Omit<NotificationListQuery, 'cursor'>;
export const notificationKeys = {
   all: ['notifications'] as const,
   scope: (w: string, u: string) => ['notifications', w, u] as const,
   lists: (w: string, u: string) => [...notificationKeys.scope(w, u), 'list'] as const,
   list: (w: string, u: string, filters: NotificationFilters) =>
      [...notificationKeys.lists(w, u), filters] as const,
   detail: (w: string, u: string, id: string) =>
      [...notificationKeys.scope(w, u), 'detail', id] as const,
   unreadCount: (w: string, u: string) =>
      [...notificationKeys.scope(w, u), 'unread-count'] as const,
   preferences: (w: string, u: string) => [...notificationKeys.scope(w, u), 'preferences'] as const,
   deliveries: (w: string, u: string, id: string) =>
      [...notificationKeys.scope(w, u), 'deliveries', id] as const,
   actor: (w: string, u: string, id: string) =>
      [...notificationKeys.scope(w, u), 'actor', id] as const,
   target: (w: string, u: string, type: string, id: string) =>
      ['notification-targets', w, u, type, id] as const,
};
const base = (w: string, u: string) => ({
   enabled: Boolean(w && u),
   staleTime: 60_000,
   retry: false as const,
   refetchOnWindowFocus: true,
});
export const notificationListQueryOptions = (
   api: ApiClient,
   w: string,
   u: string,
   filters: NotificationFilters
) =>
   infiniteQueryOptions({
      ...base(w, u),
      queryKey: notificationKeys.list(w, u, filters),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ signal, pageParam }) =>
         notificationsApi.list(api, w, { ...filters, cursor: pageParam }, signal),
      getNextPageParam: (page) => (page.hasNext ? (page.nextCursor ?? undefined) : undefined),
   });
export const notificationPreferencesQueryOptions = (api: ApiClient, w: string, u: string) =>
   queryOptions({
      ...base(w, u),
      queryKey: notificationKeys.preferences(w, u),
      queryFn: ({ signal }) => notificationsApi.preferences(api, w, signal),
   });
export const unreadCountQueryOptions = (api: ApiClient, w: string, u: string) =>
   queryOptions({
      ...base(w, u),
      queryKey: notificationKeys.unreadCount(w, u),
      queryFn: ({ signal }) => notificationsApi.unreadCount(api, w, signal),
   });
export const notificationDetailQueryOptions = (api: ApiClient, w: string, u: string, id: string) =>
   queryOptions({
      ...base(w, u),
      enabled: Boolean(w && u && id),
      queryKey: notificationKeys.detail(w, u, id),
      queryFn: ({ signal }) => notificationsApi.get(api, w, id, signal),
   });
export const notificationActorQueryOptions = (api: ApiClient, w: string, u: string, id: string) =>
   queryOptions({
      ...base(w, u),
      enabled: Boolean(w && u && id),
      queryKey: notificationKeys.actor(w, u, id),
      queryFn: ({ signal }) => notificationsApi.actor(api, w, id, signal),
   });
export const notificationDeliveriesQueryOptions = (
   api: ApiClient,
   w: string,
   u: string,
   id: string
) =>
   queryOptions({
      ...base(w, u),
      enabled: Boolean(w && u && id),
      queryKey: notificationKeys.deliveries(w, u, id),
      queryFn: ({ signal }) => notificationsApi.deliveries(api, w, id, signal),
   });
export const notificationTargetQueryOptions = (
   api: ApiClient,
   w: string,
   u: string,
   notification: Notification
) => {
   const target = targetOf(notification);
   return queryOptions({
      ...base(w, u),
      enabled: Boolean(w && u && target),
      queryKey: notificationKeys.target(
         w,
         u,
         target?.type ?? 'missing',
         target?.id ?? notification.id
      ),
      queryFn: ({ signal }) => {
         if (!target) throw new Error('Notification has no target.');
         return notificationsApi.target(api, w, target, signal);
      },
   });
};
