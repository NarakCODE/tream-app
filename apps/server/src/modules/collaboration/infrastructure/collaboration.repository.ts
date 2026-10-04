import { Injectable } from '@nestjs/common';
import { and, or, eq, isNull, sql, desc } from 'drizzle-orm';
import {
  comments,
  events,
  labels,
  issueLabels,
  projectLabels,
  commentReactions,
  issueSubscribers,
  projectSubscribers,
  memberships,
  issueTemplates,
} from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import type { Target } from '../application/collaboration-policy';
@Injectable()
export class CollaborationRepository {
  async comments(
    tx: Tx,
    workspaceId: string,
    target: Target,
    limit: number,
    cursor?: string,
  ) {
    const field =
      target.targetType === 'issue'
        ? comments.issueId
        : target.targetType === 'project'
          ? comments.projectId
          : target.targetType === 'project_update'
            ? comments.projectUpdateId
            : target.targetType === 'initiative'
              ? comments.initiativeId
              : comments.initiativeUpdateId;
    const base = and(
      eq(comments.workspaceId, workspaceId),
      eq(field, target.targetId),
    );
    const seek = cursor ? decodeCursor(cursor) : undefined;
    const rows = await tx
      .select()
      .from(comments)
      .where(
        and(
          base,
          seek
            ? sql`(date_trunc('milliseconds',${comments.createdAt}),${comments.id}) < (${seek.createdAt.toISOString()}::timestamptz,${seek.id})`
            : undefined,
        ),
      )
      .orderBy(
        desc(sql`date_trunc('milliseconds',${comments.createdAt})`),
        desc(comments.id),
      )
      .limit(limit + 1);
    const counts = await tx
      .select({ total: sql<number>`count(*)::integer` })
      .from(comments)
      .where(base);
    return this.page(
      rows.map((x) => (x.deletedAt ? { ...x, body: null } : x)),
      counts[0]!.total,
      limit,
      cursor,
    );
  }
  async activity(
    tx: Tx,
    workspaceId: string,
    issueId: string,
    limit: number,
    cursor?: string,
  ) {
    const base = and(
      eq(events.workspaceId, workspaceId),
      or(
        and(eq(events.aggregateType, 'issue'), eq(events.aggregateId, issueId)),
        sql`EXISTS (SELECT 1 FROM issue_activity ia WHERE ia.event_id=${events.id} AND ia.workspace_id=${workspaceId} AND ia.issue_id=${issueId})`,
      ),
    );
    const seek = cursor ? decodeCursor(cursor) : undefined;
    const rows = await tx
      .select({
        id: events.id,
        createdAt: events.createdAt,
        actorId: events.actorId,
        action: events.eventType,
        revision: events.aggregateVersion,
      })
      .from(events)
      .where(
        and(
          base,
          seek
            ? sql`(date_trunc('milliseconds',${events.createdAt}),${events.id}) < (${seek.createdAt.toISOString()}::timestamptz,${seek.id})`
            : undefined,
        ),
      )
      .orderBy(
        desc(sql`date_trunc('milliseconds',${events.createdAt})`),
        desc(events.id),
      )
      .limit(limit + 1);
    const counts = await tx
      .select({ total: sql<number>`count(*)::integer` })
      .from(events)
      .where(base);
    return this.page(rows, counts[0]!.total, limit, cursor);
  }
  async scoped(
    tx: Tx,
    workspaceId: string,
    table: typeof labels | typeof issueTemplates,
    memberId: string,
    role: string,
    limit: number,
    cursor?: string,
  ) {
    const base = and(
      eq(table.workspaceId, workspaceId),
      isNull(table.archivedAt),
      table === issueTemplates
        ? sql`(
        (${role} <> 'GUEST')
        AND (${issueTemplates.defaults}->>'projectId' IS NULL OR EXISTS (
          SELECT 1 FROM projects p WHERE p.id=${issueTemplates.defaults}->>'projectId' AND p.workspace_id=${workspaceId} AND p.archived_at IS NULL AND p.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM project_teams pt JOIN teams t ON t.id=pt.team_id WHERE pt.project_id=p.id AND t.visibility='PRIVATE' AND NOT EXISTS (SELECT 1 FROM team_memberships tm WHERE tm.team_id=t.id AND tm.membership_id=${memberId}))
        ))
        AND (${issueTemplates.defaults}->>'statusId' IS NULL OR EXISTS (SELECT 1 FROM issue_statuses s WHERE s.id=${issueTemplates.defaults}->>'statusId' AND s.team_id=${issueTemplates.teamId} AND s.retired_at IS NULL))
        AND (${issueTemplates.defaults}->>'cycleId' IS NULL OR EXISTS (SELECT 1 FROM cycles c WHERE c.id=${issueTemplates.defaults}->>'cycleId' AND c.team_id=${issueTemplates.teamId} AND c.completed_at IS NULL AND c.canceled_at IS NULL))
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(${issueTemplates.defaults}->'labelIds','[]'::jsonb)) x(id) WHERE NOT EXISTS(SELECT 1 FROM labels l WHERE l.id=x.id AND l.workspace_id=${workspaceId} AND l.archived_at IS NULL AND (l.team_id IS NULL OR l.team_id=${issueTemplates.teamId})))
      )`
        : undefined,

      sql`(${table.teamId} IS NULL OR EXISTS (SELECT 1 FROM teams t WHERE t.id=${table.teamId} AND t.retired_at IS NULL AND ((${role} <> 'GUEST' AND t.visibility='WORKSPACE') OR EXISTS (SELECT 1 FROM team_memberships tm WHERE tm.team_id=t.id AND tm.membership_id=${memberId}))))`,
    );
    const seek = cursor ? decodeCursor(cursor) : undefined;
    const rows = await tx
      .select()
      .from(table)
      .where(
        and(
          base,
          seek
            ? sql`(date_trunc('milliseconds',${table.createdAt}),${table.id}) < (${seek.createdAt.toISOString()}::timestamptz,${seek.id})`
            : undefined,
        ),
      )
      .orderBy(
        desc(sql`date_trunc('milliseconds',${table.createdAt})`),
        desc(table.id),
      )
      .limit(limit + 1);
    const counts = await tx
      .select({ total: sql<number>`count(*)::integer` })
      .from(table)
      .where(base);
    return this.page(rows, counts[0]!.total, limit, cursor);
  }
  async assignments(tx: Tx, target: Target, limit: number, cursor?: string) {
    const table = target.targetType === 'issue' ? issueLabels : projectLabels;
    const field =
      target.targetType === 'issue'
        ? issueLabels.issueId
        : projectLabels.projectId;
    const base = eq(field, target.targetId);
    const seek = cursor ? decodeCursor(cursor) : undefined;
    const rows = await tx
      .select({ id: table.id, createdAt: table.createdAt, label: labels })
      .from(table)
      .innerJoin(labels, eq(labels.id, table.labelId))
      .where(
        and(
          base,
          seek
            ? sql`(date_trunc('milliseconds',${table.createdAt}),${table.id}) < (${seek.createdAt.toISOString()}::timestamptz,${seek.id})`
            : undefined,
        ),
      )
      .orderBy(
        desc(sql`date_trunc('milliseconds',${table.createdAt})`),
        desc(table.id),
      )
      .limit(limit + 1);
    const counts = await tx
      .select({ total: sql<number>`count(*)::integer` })
      .from(table)
      .where(base);
    return this.page(rows, counts[0]!.total, limit, cursor);
  }
  async reactions(tx: Tx, commentId: string, limit: number, cursor?: string) {
    const base = eq(commentReactions.commentId, commentId);
    const seek = cursor ? decodeCursor(cursor) : undefined;
    const rows = await tx
      .select()
      .from(commentReactions)
      .where(
        and(
          base,
          seek
            ? sql`(date_trunc('milliseconds',${commentReactions.createdAt}),${commentReactions.id}) < (${seek.createdAt.toISOString()}::timestamptz,${seek.id})`
            : undefined,
        ),
      )
      .orderBy(
        desc(sql`date_trunc('milliseconds',${commentReactions.createdAt})`),
        desc(commentReactions.id),
      )
      .limit(limit + 1);
    const counts = await tx
      .select({ total: sql<number>`count(*)::integer` })
      .from(commentReactions)
      .where(base);
    return this.page(rows, counts[0]!.total, limit, cursor);
  }
  async subscribers(tx: Tx, target: Target, limit: number, cursor?: string) {
    const table =
      target.targetType === 'issue' ? issueSubscribers : projectSubscribers;
    const field =
      target.targetType === 'issue'
        ? issueSubscribers.issueId
        : projectSubscribers.projectId;
    const visibility =
      target.targetType === 'issue'
        ? sql`NOT EXISTS (
          WITH RECURSIVE ancestry AS (
            SELECT i.id,i.team_id,i.project_id,i.parent_id FROM issues i WHERE i.id=${target.targetId}
            UNION SELECT p.id,p.team_id,p.project_id,p.parent_id FROM issues p JOIN ancestry a ON p.id=a.parent_id
          )
          SELECT 1 FROM ancestry a JOIN teams t ON t.id=a.team_id WHERE
          NOT ((${memberships.role}<>'GUEST' AND t.visibility='WORKSPACE') OR EXISTS (SELECT 1 FROM team_memberships tm WHERE tm.team_id=t.id AND tm.membership_id=${memberships.id}))
          OR (a.project_id IS NOT NULL AND (${memberships.role}='GUEST' OR EXISTS (SELECT 1 FROM project_teams pt JOIN teams ptm ON ptm.id=pt.team_id WHERE pt.project_id=a.project_id AND ptm.visibility='PRIVATE' AND NOT EXISTS (SELECT 1 FROM team_memberships tm WHERE tm.team_id=ptm.id AND tm.membership_id=${memberships.id}))))
        )`
        : sql`${memberships.role}<>'GUEST' AND NOT EXISTS (SELECT 1 FROM project_teams pt JOIN teams t ON t.id=pt.team_id WHERE pt.project_id=${target.targetId} AND t.visibility='PRIVATE' AND NOT EXISTS (SELECT 1 FROM team_memberships tm WHERE tm.team_id=t.id AND tm.membership_id=${memberships.id}))`;
    const base = and(
      eq(field, target.targetId),
      eq(memberships.state, 'ACTIVE'),
      visibility,
    );
    const seek = cursor ? decodeCursor(cursor) : undefined;
    const rows = await tx
      .select({
        id: table.id,
        createdAt: table.createdAt,
        membershipId: table.membershipId,
      })
      .from(table)
      .innerJoin(memberships, eq(memberships.id, table.membershipId))
      .where(
        and(
          base,
          seek
            ? sql`(date_trunc('milliseconds',${table.createdAt}),${table.id}) < (${seek.createdAt.toISOString()}::timestamptz,${seek.id})`
            : undefined,
        ),
      )
      .orderBy(
        desc(sql`date_trunc('milliseconds',${table.createdAt})`),
        desc(table.id),
      )
      .limit(limit + 1);
    const counts = await tx
      .select({ total: sql<number>`count(*)::integer` })
      .from(table)
      .innerJoin(memberships, eq(memberships.id, table.membershipId))
      .where(base);
    return this.page(rows, counts[0]!.total, limit, cursor);
  }
  page<T extends { id: string; createdAt: Date }>(
    rows: T[],
    total: number,
    limit: number,
    cursor?: string,
  ) {
    const items = rows.slice(0, limit);
    return {
      paginationType: 'cursor',
      items,
      total,
      limit,
      cursor: cursor ?? null,
      hasNext: rows.length > limit,
      nextCursor:
        rows.length > limit ? encodeCursor(items[items.length - 1]!) : null,
    };
  }
}
