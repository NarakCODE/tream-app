import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import type { Notification, NotificationCursorPage, NotificationPreferences } from '@repo/schemas';
import { notificationKeys, type NotificationFilters } from './queries';

export type NotificationPages = InfiniteData<NotificationCursorPage, string | undefined>;
const removals = new WeakMap<QueryClient, Map<string, number>>();
export function removalGeneration(client: QueryClient, w: string, u: string, id: string) {
   return removals.get(client)?.get(JSON.stringify([w, u, id])) ?? 0;
}
export function matchesFilters(item: Notification, filters: NotificationFilters, now = Date.now()) {
   const snoozed = item.snoozedUntil !== null && Date.parse(item.snoozedUntil) > now;
   const statusMatches =
      filters.status === 'all' ||
      (filters.status === 'archived'
         ? Boolean(item.archivedAt)
         : filters.status === 'snoozed'
           ? !item.archivedAt && snoozed
           : !item.archivedAt && !snoozed);
   return (
      statusMatches &&
      (filters.unread === undefined ||
         (filters.unread === 'true' ? !item.readAt : Boolean(item.readAt)))
   );
}
export function contributesUnread(item: Notification) {
   return matchesFilters(item, { status: 'inbox', unread: 'true', limit: 25 });
}
export function cachedNotification(client: QueryClient, w: string, u: string, id: string) {
   let latest = client.getQueryData<Notification>(notificationKeys.detail(w, u, id));
   for (const [, data] of client.getQueriesData<NotificationPages>({
      queryKey: notificationKeys.lists(w, u),
   })) {
      const item = data?.pages.flatMap((page) => page.items).find((item) => item.id === id);
      if (item && (!latest || item.revision > latest.revision)) latest = item;
   }
   return latest;
}
type Position = { key: QueryKey; page: number; index: number; item: Notification };
export type NotificationSnapshot = {
   positions: Position[];
   detail: Notification | undefined;
   unreadDelta: number;
   removalGeneration: number;
};
export function patchNotification(client: QueryClient, w: string, u: string, item: Notification) {
   client.setQueryData(notificationKeys.detail(w, u, item.id), item);
   for (const [key, data] of client.getQueriesData<NotificationPages>({
      queryKey: notificationKeys.lists(w, u),
   })) {
      if (!data) continue;
      const filters = key[4] as NotificationFilters;
      const present = data.pages.some((page) => page.items.some((row) => row.id === item.id));
      if (!present) continue;
      const keep = matchesFilters(item, filters);
      client.setQueryData<NotificationPages>(key, {
         ...data,
         pages: data.pages.map((page) => ({
            ...page,
            total: keep ? page.total : Math.max(0, page.total - 1),
            items: page.items.flatMap((row) => (row.id !== item.id ? [row] : keep ? [item] : [])),
         })),
      });
   }
}
export function optimisticNotification(
   client: QueryClient,
   w: string,
   u: string,
   before: Notification,
   after: Notification
): NotificationSnapshot {
   const positions: Position[] = [];
   for (const [key, data] of client.getQueriesData<NotificationPages>({
      queryKey: notificationKeys.lists(w, u),
   })) {
      data?.pages.forEach((page, p) =>
         page.items.forEach((item, index) => {
            if (item.id === before.id) positions.push({ key, page: p, index, item });
         })
      );
   }
   const detail = client.getQueryData<Notification>(notificationKeys.detail(w, u, before.id));
   const prefs = client.getQueryData<NotificationPreferences>(notificationKeys.preferences(w, u));
   const unreadDelta =
      prefs?.inAppEnabled === false
         ? 0
         : Number(contributesUnread(after)) - Number(contributesUnread(before));
   patchNotification(client, w, u, after);
   adjustUnread(client, w, u, unreadDelta);
   return {
      positions,
      detail,
      unreadDelta,
      removalGeneration: removalGeneration(client, w, u, before.id),
   };
}
function adjustUnread(client: QueryClient, w: string, u: string, delta: number) {
   client.setQueryData<{ unreadCount: number }>(notificationKeys.unreadCount(w, u), (previous) =>
      previous ? { unreadCount: Math.max(0, previous.unreadCount + delta) } : previous
   );
}
export function rollbackNotification(
   client: QueryClient,
   w: string,
   u: string,
   before: Notification,
   snapshot: NotificationSnapshot
) {
   // A visibility loss after the snapshot is authoritative, even if this command failed.
   if (removalGeneration(client, w, u, before.id) !== snapshot.removalGeneration) return;
   for (const position of snapshot.positions) {
      client.setQueryData<NotificationPages>(position.key, (data) => {
         if (!data) return data;
         const present = data.pages.some((page) =>
            page.items.some((item) => item.id === before.id)
         );
         return {
            ...data,
            pages: data.pages.map((page, index) => {
               const items = page.items.map((item) =>
                  item.id === before.id ? position.item : item
               );
               if (!present && index === position.page)
                  items.splice(Math.min(position.index, items.length), 0, position.item);
               return { ...page, items, total: present ? page.total : page.total + 1 };
            }),
         };
      });
   }
   if (snapshot.detail)
      client.setQueryData(notificationKeys.detail(w, u, before.id), snapshot.detail);
   else client.removeQueries({ queryKey: notificationKeys.detail(w, u, before.id), exact: true });
   adjustUnread(client, w, u, -snapshot.unreadDelta);
}
export function removeNotification(client: QueryClient, w: string, u: string, id: string) {
   let generations = removals.get(client);
   if (!generations) {
      generations = new Map();
      removals.set(client, generations);
   }
   generations.set(JSON.stringify([w, u, id]), removalGeneration(client, w, u, id) + 1);
   for (const [key, data] of client.getQueriesData<NotificationPages>({
      queryKey: notificationKeys.lists(w, u),
   })) {
      if (!data || !data.pages.some((page) => page.items.some((item) => item.id === id))) continue;
      client.setQueryData<NotificationPages>(key, {
         ...data,
         pages: data.pages.map((page) => ({
            ...page,
            total: Math.max(0, page.total - 1),
            items: page.items.filter((item) => item.id !== id),
         })),
      });
   }
   for (const key of [
      notificationKeys.detail(w, u, id),
      notificationKeys.actor(w, u, id),
      notificationKeys.deliveries(w, u, id),
   ])
      client.removeQueries({ queryKey: key, exact: true });
   // A count refetch must not overwrite another row's optimistic count change.
   if (client.isMutating({ mutationKey: notificationKeys.scope(w, u) }) === 0)
      void client.invalidateQueries({ queryKey: notificationKeys.unreadCount(w, u) });
}
export function removeTargetNotifications(
   client: QueryClient,
   w: string,
   u: string,
   notification: Notification
) {
   const ids = new Set([notification.id]);
   for (const [, data] of client.getQueriesData<NotificationPages>({
      queryKey: notificationKeys.lists(w, u),
   })) {
      for (const item of data?.pages.flatMap((page) => page.items) ?? []) {
         if (
            (notification.issueId && notification.issueId === item.issueId) ||
            (notification.projectId && notification.projectId === item.projectId) ||
            (notification.initiativeId && notification.initiativeId === item.initiativeId) ||
            (notification.documentId && notification.documentId === item.documentId)
         )
            ids.add(item.id);
      }
   }
   ids.forEach((id) => removeNotification(client, w, u, id));
}
