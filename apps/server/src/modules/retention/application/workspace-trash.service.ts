import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import { memberships, workspaces } from '../../../database/schema';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import { recoveryDeadline } from './retention-policy.service';
import type { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';
@Injectable()
export class WorkspaceTrashService {
  constructor(private readonly db: DatabaseService) {}
  list(userId: string, query: CursorPaginationQueryDto) {
    return this.db.db.transaction(async (tx) => {
      const scope = and(
        eq(memberships.userId, userId),
        eq(memberships.role, 'OWNER'),
        eq(memberships.state, 'ACTIVE'),
        isNotNull(workspaces.deletedAt),
      );
      const [count] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(workspaces)
        .innerJoin(memberships, eq(memberships.workspaceId, workspaces.id))
        .where(scope);
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
      const rows = await tx
        .select({
          id: workspaces.id,
          name: workspaces.name,
          deletedAt: workspaces.deletedAt,
          purgedAt: workspaces.purgedAt,
          createdAt: workspaces.createdAt,
        })
        .from(workspaces)
        .innerJoin(memberships, eq(memberships.workspaceId, workspaces.id))
        .where(
          and(
            scope,
            cursor
              ? sql`(date_trunc('milliseconds',${workspaces.deletedAt}),${workspaces.id})<(${cursor.createdAt.toISOString()}::timestamptz,${cursor.id})`
              : undefined,
          ),
        )
        .orderBy(
          desc(sql`date_trunc('milliseconds',${workspaces.deletedAt})`),
          desc(workspaces.id),
        )
        .limit(query.limit + 1);
      const items = rows.slice(0, query.limit).map((row) => ({
        ...row,
        recoveryDeadline: recoveryDeadline(row.deletedAt!),
        recoverable:
          !row.purgedAt && recoveryDeadline(row.deletedAt!) > new Date(),
        restoreThrough: `/api/v1/workspaces/${row.id}`,
      }));
      const last = items.at(-1);
      return {
        paginationType: 'cursor',
        items,
        total: count?.total ?? 0,
        cursor: query.cursor ?? null,
        limit: query.limit,
        hasNext: rows.length > query.limit,
        nextCursor:
          rows.length > query.limit && last
            ? encodeCursor({ createdAt: last.deletedAt!, id: last.id })
            : null,
      };
    });
  }
}
