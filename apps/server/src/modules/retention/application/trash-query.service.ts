import { ForbiddenException, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { resourceVisibility } from '../../audit-history/infrastructure/resource-visibility';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import type { TrashQueryDto } from '../presentation/trash-query.dto';
interface TrashRow extends Record<string, unknown> {
  id: string;
  resourceType: string;
  label: string;
  deletedAt: Date;
  createdAt: Date;
  resourceKey: string;
  total: number;
}
@Injectable()
export class TrashQueryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: WorkspaceAuthorizationService,
  ) {}
  list(userId: string, w: string, query: TrashQueryDto) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.access.require(
        tx,
        userId,
        w,
        'workspace.read',
        { archived: true },
      );
      if (!['OWNER', 'ADMIN'].includes(member.role))
        throw new ForbiddenException(
          'Workspace trash history requires an administrator.',
        );
      const sources = sql`SELECT id,'issue'::text AS kind,title AS label,deleted_at,created_at FROM issues WHERE workspace_id=${w} AND deleted_at IS NOT NULL
 UNION ALL SELECT id,'project',name,deleted_at,created_at FROM projects WHERE workspace_id=${w} AND deleted_at IS NOT NULL
 UNION ALL SELECT id,'document',title,deleted_at,created_at FROM documents WHERE workspace_id=${w} AND deleted_at IS NOT NULL
 UNION ALL SELECT id,'initiative',name,deleted_at,created_at FROM initiatives WHERE workspace_id=${w} AND deleted_at IS NOT NULL
 UNION ALL SELECT id,'view',name,deleted_at,created_at FROM saved_views WHERE workspace_id=${w} AND deleted_at IS NOT NULL
 UNION ALL SELECT id,'comment','Comment',deleted_at,created_at FROM comments WHERE workspace_id=${w} AND deleted_at IS NOT NULL
 UNION ALL SELECT id,'file',name,deleted_at,created_at FROM files WHERE workspace_id=${w} AND status='DELETED'`;
      const visible = resourceVisibility(sql`r.kind`, sql`r.id`, w, member.id);
      const base = sql`WITH resources AS (${sources}) SELECT * FROM resources r WHERE ${visible} ${query.resourceType ? sql`AND r.kind=${query.resourceType}` : sql``}`;
      const [count] = (
        await tx.execute<{ total: number }>(
          sql`SELECT count(*)::int AS total FROM (${base}) scoped`,
        )
      ).rows;
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
      const rows = (
        await tx.execute<TrashRow>(
          sql`SELECT id,kind AS "resourceType",label,deleted_at AS "deletedAt",created_at AS "createdAt",kind||':'||id AS "resourceKey" FROM (${base}) r ${cursor ? sql`WHERE (date_trunc('milliseconds',deleted_at),kind||':'||id)<(${cursor.createdAt.toISOString()}::timestamptz,${cursor.id})` : sql``} ORDER BY date_trunc('milliseconds',deleted_at) DESC,kind||':'||id DESC LIMIT ${query.limit + 1}`,
        )
      ).rows;
      const raw = rows.slice(0, query.limit);
      const items = raw.map(({ resourceKey, ...row }) => {
        void resourceKey;
        return {
          ...row,
          recoveryDeadline: null,
          restoreThrough:
            row.resourceType === 'comment'
              ? null
              : `/api/v1/workspaces/${w}/${row.resourceType === 'issue' ? 'issues' : row.resourceType === 'project' ? 'projects' : row.resourceType === 'document' ? 'documents' : row.resourceType === 'initiative' ? 'initiatives' : row.resourceType === 'view' ? 'views' : 'files'}/${row.id}/restore`,
        };
      });
      const last = raw.at(-1);
      return {
        paginationType: 'cursor',
        items,
        total: count?.total ?? 0,
        cursor: query.cursor ?? null,
        limit: query.limit,
        hasNext: rows.length > query.limit,
        nextCursor:
          rows.length > query.limit && last
            ? encodeCursor({ createdAt: last.deletedAt, id: last.resourceKey })
            : null,
      };
    });
  }
}
