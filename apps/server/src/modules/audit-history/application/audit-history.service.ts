import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import { auditLogs } from '../../../database/schema';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import { resourceVisibility } from '../infrastructure/resource-visibility';
import { redactAuditMetadata } from '../domain/audit-redaction';
import type { AuditQueryDto } from '../presentation/audit-query.dto';
@Injectable()
export class AuditHistoryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: WorkspaceAuthorizationService,
  ) {}
  list(userId: string, workspaceId: string, query: AuditQueryDto) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.access.require(
        tx,
        userId,
        workspaceId,
        'workspace.read',
        { archived: true },
      );
      if (!['OWNER', 'ADMIN'].includes(member.role))
        throw new ForbiddenException(
          'Audit history requires a workspace administrator.',
        );
      const visibility = resourceVisibility(
        sql`${auditLogs.targetType}`,
        sql`${auditLogs.targetId}`,
        workspaceId,
        member.id,
      );
      const scope = and(
        eq(auditLogs.workspaceId, workspaceId),
        visibility,
        query.targetType
          ? eq(auditLogs.targetType, query.targetType)
          : undefined,
        query.targetId ? eq(auditLogs.targetId, query.targetId) : undefined,
        query.actorId ? eq(auditLogs.actorId, query.actorId) : undefined,
        query.action ? eq(auditLogs.action, query.action) : undefined,
        query.correlationId
          ? sql`COALESCE(${auditLogs.correlationId},${auditLogs.metadata}->>'correlation_id')=${query.correlationId}`
          : undefined,
      );
      const [count] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(scope);
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
      const rows = await tx
        .select()
        .from(auditLogs)
        .where(
          and(
            scope,
            cursor
              ? sql`(date_trunc('milliseconds',${auditLogs.createdAt}),${auditLogs.id})<(${cursor.createdAt.toISOString()}::timestamptz,${cursor.id})`
              : undefined,
          ),
        )
        .orderBy(
          desc(sql`date_trunc('milliseconds',${auditLogs.createdAt})`),
          desc(auditLogs.id),
        )
        .limit(query.limit + 1);
      const items = rows.slice(0, query.limit).map((row) => ({
        ...row,
        metadata: redactAuditMetadata(row.metadata),
        correlationId:
          row.correlationId ??
          (typeof row.metadata.correlation_id === 'string'
            ? row.metadata.correlation_id
            : null),
      }));
      return {
        paginationType: 'cursor',
        items,
        cursor: query.cursor ?? null,
        limit: query.limit,
        total: count?.total ?? 0,
        hasNext: rows.length > query.limit,
        nextCursor:
          rows.length > query.limit
            ? encodeCursor(items[items.length - 1]!)
            : null,
      };
    });
  }
}
