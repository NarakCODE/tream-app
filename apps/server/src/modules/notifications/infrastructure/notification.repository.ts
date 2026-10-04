import { Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  isNull,
  isNotNull,
  or,
  lte,
  gt,
  sql,
} from 'drizzle-orm';
import {
  notifications,
  notificationPreferences,
} from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import { notificationVisibility } from './notification-visibility';
import type { NotificationListDto } from '../presentation/notification.dto';
@Injectable()
export class NotificationRepository {
  preference(tx: Tx, w: string, memberId: string) {
    return tx
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.workspaceId, w),
          eq(notificationPreferences.recipientMembershipId, memberId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }
  async list(
    tx: Tx,
    w: string,
    memberId: string,
    guest: boolean,
    query: NotificationListDto,
  ) {
    const now = new Date();
    const base = and(
      eq(notifications.workspaceId, w),
      eq(notifications.recipientMembershipId, memberId),
      notificationVisibility(memberId, guest),
      query.status === 'archived'
        ? isNotNull(notifications.archivedAt)
        : query.status === 'inbox' || query.status === 'snoozed'
          ? isNull(notifications.archivedAt)
          : undefined,
      query.status === 'snoozed'
        ? gt(notifications.snoozedUntil, now)
        : query.status === 'inbox'
          ? or(
              isNull(notifications.snoozedUntil),
              lte(notifications.snoozedUntil, now),
            )
          : undefined,
      query.unread === 'true'
        ? isNull(notifications.readAt)
        : query.unread === 'false'
          ? isNotNull(notifications.readAt)
          : undefined,
    );
    const seek = query.cursor ? decodeCursor(query.cursor) : undefined;
    const rows = await tx
      .select()
      .from(notifications)
      .where(
        and(
          base,
          seek
            ? sql`(date_trunc('milliseconds',${notifications.createdAt}),${notifications.id})<(${seek.createdAt.toISOString()}::timestamptz,${seek.id})`
            : undefined,
        ),
      )
      .orderBy(
        desc(sql`date_trunc('milliseconds',${notifications.createdAt})`),
        desc(notifications.id),
      )
      .limit(query.limit + 1);
    const [count] = await tx
      .select({ total: sql<number>`count(*)::integer` })
      .from(notifications)
      .where(base);
    const items = rows.slice(0, query.limit).map(({ title, body, ...row }) => {
      void title;
      void body;
      return row;
    });
    return {
      paginationType: 'cursor',
      items,
      total: count!.total,
      limit: query.limit,
      cursor: query.cursor ?? null,
      hasNext: rows.length > query.limit,
      nextCursor:
        rows.length > query.limit
          ? encodeCursor(items[items.length - 1]!)
          : null,
    };
  }
  async unread(tx: Tx, w: string, memberId: string, guest: boolean) {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::integer` })
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, w),
          eq(notifications.recipientMembershipId, memberId),
          isNull(notifications.readAt),
          isNull(notifications.archivedAt),
          or(
            isNull(notifications.snoozedUntil),
            lte(notifications.snoozedUntil, new Date()),
          ),
          notificationVisibility(memberId, guest),
        ),
      );
    return { unreadCount: row!.count };
  }
}
