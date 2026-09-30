import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import {
  memberships,
  workspaces,
} from '../../../database/schema/workspace.schema';
import {
  events,
  eventDispatchAttempts,
} from '../../../database/schema/event.schema';
import { hasPermission } from '../../iam/workspaces/domain/permissions';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import type { OutboxQueryDto } from '../presentation/dto/outbox-query.dto';
@Injectable()
export class OutboxMonitor {
  constructor(private readonly database: DatabaseService) {}
  list(userId: string, workspaceId: string, query: OutboxQueryDto) {
    return this.database.db.transaction(async (tx) => {
      const [member] = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.state, 'ACTIVE'),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1);
      if (!member) throw new NotFoundException('Workspace not found.');
      if (!hasPermission(member.role, 'audit.read'))
        throw new ForbiddenException('Permission denied.');
      const scopedFilter = and(
        eq(events.workspaceId, workspaceId),
        query.status
          ? eq(eventDispatchAttempts.status, query.status)
          : or(
              eq(eventDispatchAttempts.status, 'FAILED'),
              eq(eventDispatchAttempts.status, 'QUARANTINED'),
            ),
      );
      const [total] = await tx
        .select({ value: count() })
        .from(eventDispatchAttempts)
        .innerJoin(events, eq(eventDispatchAttempts.eventId, events.id))
        .where(scopedFilter);
      // Cursor dates serialize milliseconds; compare and sort at that same precision.
      const createdAt = sql`date_trunc('milliseconds', ${eventDispatchAttempts.createdAt})`;
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
      const rows = await tx
        .select({
          id: eventDispatchAttempts.id,
          eventId: events.id,
          eventType: events.eventType,
          schemaVersion: events.schemaVersion,
          consumerKey: eventDispatchAttempts.consumerKey,
          status: eventDispatchAttempts.status,
          attemptCount: eventDispatchAttempts.attemptCount,
          lastError: eventDispatchAttempts.lastError,
          availableAt: eventDispatchAttempts.availableAt,
          createdAt: eventDispatchAttempts.createdAt,
        })
        .from(eventDispatchAttempts)
        .innerJoin(events, eq(eventDispatchAttempts.eventId, events.id))
        .where(
          and(
            eq(events.workspaceId, workspaceId),
            query.status
              ? eq(eventDispatchAttempts.status, query.status)
              : or(
                  eq(eventDispatchAttempts.status, 'FAILED'),
                  eq(eventDispatchAttempts.status, 'QUARANTINED'),
                ),
            cursor
              ? or(
                  lt(createdAt, cursor.createdAt),
                  and(
                    eq(createdAt, cursor.createdAt),
                    lt(eventDispatchAttempts.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(createdAt), desc(eventDispatchAttempts.id))
        .limit(query.limit + 1);
      const data = rows.slice(0, query.limit);
      const last = data.at(-1);
      return {
        paginationType: 'cursor' as const,
        items: data,
        cursor: query.cursor ?? null,
        hasNext: rows.length > query.limit,
        limit: query.limit,
        total: total?.value ?? 0,
        nextCursor:
          rows.length > query.limit && last ? encodeCursor(last) : null,
      };
    });
  }
}
