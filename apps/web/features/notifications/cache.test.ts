import { QueryClient } from '@tanstack/react-query';
import type { Notification } from '@repo/schemas';
import { describe, expect, it } from 'vitest';
import {
   matchesFilters,
   optimisticNotification,
   rollbackNotification,
   removeTargetNotifications,
   removeNotification,
   type NotificationPages,
} from './cache';
import { notificationKeys } from './queries';

const row = (id: string): Notification => ({
   id,
   workspaceId: 'w',
   recipientMembershipId: 'm',
   actorMembershipId: null,
   eventId: id,
   kind: 'MENTION',
   issueId: 'shared-issue',
   projectId: null,
   initiativeId: null,
   documentId: null,
   revision: 1,
   readAt: null,
   archivedAt: null,
   snoozedUntil: null,
   createdAt: '2026-01-01T00:00:00.000Z',
   updatedAt: '2026-01-01T00:00:00.000Z',
});
const pages = (items: Notification[][]): NotificationPages => ({
   pages: items.map((items, index) => ({
      paginationType: 'cursor',
      items,
      total: 2,
      limit: 25,
      cursor: index ? 'cursor' : null,
      hasNext: !index,
      nextCursor: index ? null : 'cursor',
   })),
   pageParams: [undefined, 'cursor'],
});

describe('notification cache across loaded pages', () => {
   it('does not resurrect a row removed after an optimistic snapshot', () => {
      const client = new QueryClient();
      const key = notificationKeys.list('w', 'u', { status: 'inbox', limit: 25 });
      client.setQueryData(key, pages([[row('first')]]));
      client.setQueryData(notificationKeys.detail('w', 'u', 'first'), row('first'));
      const snapshot = optimisticNotification(client, 'w', 'u', row('first'), {
         ...row('first'),
         readAt: new Date().toISOString(),
      });
      removeNotification(client, 'w', 'u', 'first');
      rollbackNotification(client, 'w', 'u', row('first'), snapshot);
      expect(client.getQueryData<NotificationPages>(key)?.pages.flatMap((p) => p.items)).toEqual(
         []
      );
      expect(client.getQueryData(notificationKeys.detail('w', 'u', 'first'))).toBeUndefined();
   });
   it('removes a read item from unread filters and restores its page on rollback', () => {
      const client = new QueryClient();
      const key = notificationKeys.list('w', 'u', { status: 'inbox', unread: 'true', limit: 25 });
      client.setQueryData(key, pages([[row('first')], [row('second')]]));
      client.setQueryData(notificationKeys.unreadCount('w', 'u'), { unreadCount: 2 });
      const snapshot = optimisticNotification(client, 'w', 'u', row('second'), {
         ...row('second'),
         readAt: new Date().toISOString(),
      });
      expect(client.getQueryData<NotificationPages>(key)?.pages[1].items).toEqual([]);
      expect(client.getQueryData(notificationKeys.unreadCount('w', 'u'))).toEqual({
         unreadCount: 1,
      });
      rollbackNotification(client, 'w', 'u', row('second'), snapshot);
      expect(client.getQueryData<NotificationPages>(key)?.pages[1].items[0].id).toBe('second');
      expect(client.getQueryData<NotificationPages>(key)?.pageParams).toEqual([
         undefined,
         'cursor',
      ]);
      expect(client.getQueryData(notificationKeys.unreadCount('w', 'u'))).toEqual({
         unreadCount: 2,
      });
   });
   it('removes every notification for an inaccessible target without touching another workspace', () => {
      const client = new QueryClient();
      const filter = { status: 'all' as const, limit: 25 };
      const key = notificationKeys.list('w', 'u', filter);
      client.setQueryData(key, pages([[row('first')], [row('second')]]));
      const other = notificationKeys.list('other', 'u', filter);
      client.setQueryData(other, pages([[row('first')]]));
      removeTargetNotifications(client, 'w', 'u', row('first'));
      expect(client.getQueryData<NotificationPages>(key)?.pages.flatMap((p) => p.items)).toEqual(
         []
      );
      expect(client.getQueryData<NotificationPages>(other)?.pages[0].items).toHaveLength(1);
   });
   it('treats expired snoozes as inbox items and keeps archived items out of snoozed', () => {
      const expired = { ...row('expired'), snoozedUntil: '2026-01-01T00:00:00.000Z' };
      expect(
         matchesFilters(expired, { status: 'inbox', limit: 25 }, Date.parse('2026-01-02'))
      ).toBe(true);
      expect(
         matchesFilters(
            {
               ...row('archived'),
               archivedAt: '2026-01-01T00:00:00.000Z',
               snoozedUntil: '2026-03-01T00:00:00.000Z',
            },
            { status: 'snoozed', limit: 25 },
            Date.parse('2026-01-02')
         )
      ).toBe(false);
   });
});
