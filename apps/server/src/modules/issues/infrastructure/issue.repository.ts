import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, isNotNull, sql, type SQL } from 'drizzle-orm';
import {
  issues,
  teams,
  teamMemberships,
  projectTeams,
  memberships,
  issueIdentifiers,
} from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import type { CursorTuple } from '../../../common/pagination/cursor';
import type { IssueListDto } from '../presentation/issue.dto';
export type Issue = typeof issues.$inferSelect;
export function issueVisibility(memberId: string, guest: boolean) {
  return sql`EXISTS(SELECT 1 FROM ${teams} t WHERE t.id=${issues.teamId} AND ((t.visibility='WORKSPACE' AND ${!guest}) OR EXISTS(SELECT 1 FROM ${teamMemberships} tm WHERE tm.team_id=t.id AND tm.membership_id=${memberId}))) AND (${issues.projectId} IS NULL OR (${!guest} AND NOT EXISTS(SELECT 1 FROM ${projectTeams} pt JOIN ${teams} t ON t.id=pt.team_id WHERE pt.project_id=${issues.projectId} AND t.visibility='PRIVATE' AND NOT EXISTS(SELECT 1 FROM ${teamMemberships} tm WHERE tm.team_id=t.id AND tm.membership_id=${memberId})))) AND NOT EXISTS (WITH RECURSIVE ancestors AS (SELECT p.id,p.parent_id,p.team_id,p.project_id,ARRAY[p.id] AS path,1 AS depth FROM ${issues} p WHERE p.id=${issues.parentId} AND p.workspace_id=${issues.workspaceId} UNION ALL SELECT p.id,p.parent_id,p.team_id,p.project_id,a.path||p.id,a.depth+1 FROM ${issues} p JOIN ancestors a ON p.id=a.parent_id WHERE NOT p.id=ANY(a.path) AND a.depth<1000) SELECT 1 FROM ancestors a WHERE a.depth>=1000 OR NOT EXISTS(SELECT 1 FROM ${teams} t WHERE t.id=a.team_id AND ((t.visibility='WORKSPACE' AND ${!guest}) OR EXISTS(SELECT 1 FROM ${teamMemberships} tm WHERE tm.team_id=t.id AND tm.membership_id=${memberId}))) OR (a.project_id IS NOT NULL AND (${guest} OR EXISTS(SELECT 1 FROM ${projectTeams} pt JOIN ${teams} t ON t.id=pt.team_id WHERE pt.project_id=a.project_id AND t.visibility='PRIVATE' AND NOT EXISTS(SELECT 1 FROM ${teamMemberships} tm WHERE tm.team_id=t.id AND tm.membership_id=${memberId})))))`;
}
@Injectable()
export class IssueRepository {
  async find(tx: Tx, workspaceId: string, id: string, lock = false) {
    const q = tx
      .select()
      .from(issues)
      .where(and(eq(issues.workspaceId, workspaceId), eq(issues.id, id)));
    return (await (lock ? q.for('update') : q))[0];
  }
  async patch(tx: Tx, id: string, patch: Partial<typeof issues.$inferInsert>) {
    return (
      await tx
        .update(issues)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(issues.id, id))
        .returning()
    )[0]!;
  }
  async list(
    tx: Tx,
    workspaceId: string,
    memberId: string,
    guest: boolean,
    query: IssueListDto,
    cursor?: CursorTuple,
  ) {
    const visible = issueVisibility(memberId, guest);
    const terms: (SQL | undefined)[] = [
      eq(issues.workspaceId, workspaceId),
      visible,
      query.lifecycle === 'deleted'
        ? isNotNull(issues.deletedAt)
        : isNull(issues.deletedAt),
      query.lifecycle === 'archived'
        ? isNotNull(issues.archivedAt)
        : query.lifecycle === 'active'
          ? isNull(issues.archivedAt)
          : undefined,
    ];
    for (const key of [
      'teamId',
      'statusId',
      'projectId',
      'cycleId',
      'assigneeId',
      'parentId',
      'priority',
    ] as const)
      if (query[key]) terms.push(eq(issues[key], query[key]));
    const scope = and(...terms);
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(issues)
      .where(scope);
    const rows = await tx
      .select()
      .from(issues)
      .where(
        and(
          scope,
          cursor
            ? sql`(date_trunc('milliseconds',${issues.createdAt}),${issues.id})<(${cursor.createdAt.toISOString()}::timestamptz,${cursor.id})`
            : undefined,
        ),
      )
      .orderBy(
        desc(sql`date_trunc('milliseconds',${issues.createdAt})`),
        desc(issues.id),
      )
      .limit(query.limit + 1);
    return { rows, total: count?.total ?? 0 };
  }
  async identifier(tx: Tx, workspaceId: string, identifier: string) {
    return (
      await tx
        .select()
        .from(issueIdentifiers)
        .where(
          and(
            eq(issueIdentifiers.workspaceId, workspaceId),
            eq(issueIdentifiers.identifier, identifier),
          ),
        )
    )[0];
  }
  async member(tx: Tx, workspaceId: string, id: string) {
    return (
      await tx
        .select()
        .from(memberships)
        .where(
          and(eq(memberships.workspaceId, workspaceId), eq(memberships.id, id)),
        )
    )[0];
  }
}
