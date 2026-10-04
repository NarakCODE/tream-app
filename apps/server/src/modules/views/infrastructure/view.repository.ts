import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, isNotNull, sql } from 'drizzle-orm';
import {
  savedViews,
  favorites,
  issues,
  projects,
  teams,
  initiatives,
} from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { issueVisibility } from '../../issues/infrastructure/issue.repository';
import { initiativeVisibility } from '../../initiatives/infrastructure/initiative-visibility';
import {
  projectVisibility,
  teamVisible,
  viewVisibility,
} from './view-visibility';
import type { QueryCursor } from './query-cursor';
import type { ViewListDto } from '../presentation/view.dto';
export type SavedView = typeof savedViews.$inferSelect;
export type Favorite = typeof favorites.$inferSelect;
@Injectable()
export class ViewRepository {
  async get(tx: Tx, w: string, id: string, lock = false) {
    const q = tx
      .select()
      .from(savedViews)
      .where(and(eq(savedViews.workspaceId, w), eq(savedViews.id, id)));
    return (await (lock ? q.for('update') : q))[0];
  }
  async list(
    tx: Tx,
    w: string,
    memberId: string,
    guest: boolean,
    query: ViewListDto,
    cursor?: QueryCursor,
  ) {
    const scope = and(
      eq(savedViews.workspaceId, w),
      viewVisibility(memberId, guest),
      query.resource ? eq(savedViews.resource, query.resource) : undefined,
      query.lifecycle === 'deleted'
        ? and(isNotNull(savedViews.deletedAt), eq(savedViews.ownerId, memberId))
        : isNull(savedViews.deletedAt),
      query.lifecycle === 'archived'
        ? isNotNull(savedViews.archivedAt)
        : query.lifecycle === 'active'
          ? isNull(savedViews.archivedAt)
          : undefined,
    );
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(savedViews)
      .where(scope);
    const rows = await tx
      .select()
      .from(savedViews)
      .where(
        and(
          scope,
          cursor
            ? sql`(date_trunc('milliseconds',${savedViews.createdAt}),${savedViews.id})<(${cursor.position}::timestamptz,${cursor.id})`
            : undefined,
        ),
      )
      .orderBy(
        desc(sql`date_trunc('milliseconds',${savedViews.createdAt})`),
        desc(savedViews.id),
      )
      .limit(query.limit + 1);
    return { rows, total: count?.total ?? 0 };
  }
  async create(tx: Tx, value: typeof savedViews.$inferInsert) {
    return (await tx.insert(savedViews).values(value).returning())[0]!;
  }
  async patch(
    tx: Tx,
    view: SavedView,
    value: Partial<typeof savedViews.$inferInsert>,
  ) {
    return (
      await tx
        .update(savedViews)
        .set({ ...value, revision: view.revision + 1, updatedAt: new Date() })
        .where(eq(savedViews.id, view.id))
        .returning()
    )[0]!;
  }
  async visible(
    tx: Tx,
    w: string,
    id: string,
    memberId: string,
    guest: boolean,
  ) {
    return (
      (
        await tx
          .select({ id: savedViews.id })
          .from(savedViews)
          .where(
            and(
              eq(savedViews.workspaceId, w),
              eq(savedViews.id, id),
              viewVisibility(memberId, guest),
            ),
          )
          .limit(1)
      ).length > 0
    );
  }
  ownFavorites(tx: Tx, w: string, memberId: string) {
    return tx
      .select()
      .from(favorites)
      .where(
        and(eq(favorites.workspaceId, w), eq(favorites.membershipId, memberId)),
      )
      .orderBy(asc(favorites.position), asc(favorites.id));
  }
  async favorite(tx: Tx, w: string, memberId: string, id: string) {
    return (
      await tx
        .select()
        .from(favorites)
        .where(
          and(
            eq(favorites.workspaceId, w),
            eq(favorites.membershipId, memberId),
            eq(favorites.id, id),
          ),
        )
        .for('update')
    )[0];
  }
  async listFavorites(
    tx: Tx,
    w: string,
    memberId: string,
    guest: boolean,
    limit: number,
    cursor?: QueryCursor,
  ) {
    const issueAllowed = sql`${issues.id} IS NOT NULL AND ${issues.deletedAt} IS NULL AND ${issueVisibility(memberId, guest)} AND NOT EXISTS(SELECT 1 FROM projects deleted_project WHERE deleted_project.id=${issues.projectId} AND deleted_project.deleted_at IS NOT NULL)`;
    const projectAllowed = sql`${projects.id} IS NOT NULL AND ${projects.deletedAt} IS NULL AND ${projectVisibility(memberId, guest)}`;
    const teamAllowed = sql`${teams.id} IS NOT NULL AND ${teamVisible(sql`${teams.id}`, memberId, guest)}`;
    const initiativeAllowed = sql`${initiatives.id} IS NOT NULL AND ${initiatives.deletedAt} IS NULL AND ${initiativeVisibility(memberId, guest)}`;
    const viewAllowed = sql`${savedViews.id} IS NOT NULL AND ${savedViews.deletedAt} IS NULL AND ${viewVisibility(memberId, guest)}`;
    const allowed = sql`CASE WHEN ${favorites.issueId} IS NOT NULL THEN (${issueAllowed}) WHEN ${favorites.projectId} IS NOT NULL THEN (${projectAllowed}) WHEN ${favorites.teamId} IS NOT NULL THEN (${teamAllowed}) WHEN ${favorites.initiativeId} IS NOT NULL THEN (${initiativeAllowed}) ELSE (${viewAllowed}) END`;
    const type = sql<string>`CASE WHEN ${favorites.issueId} IS NOT NULL THEN 'issue' WHEN ${favorites.projectId} IS NOT NULL THEN 'project' WHEN ${favorites.teamId} IS NOT NULL THEN 'team' WHEN ${favorites.initiativeId} IS NOT NULL THEN 'initiative' ELSE 'view' END`;
    const title = sql<
      string | null
    >`CASE WHEN ${allowed} THEN coalesce(${issues.title},${projects.name},${teams.name},${initiatives.name},${savedViews.name}) ELSE NULL END`;
    const targetId = sql<
      string | null
    >`CASE WHEN ${allowed} THEN coalesce(${favorites.issueId},${favorites.projectId},${favorites.teamId},${favorites.initiativeId},${favorites.viewId}) ELSE NULL END`;
    const archived = sql`coalesce(${issues.archivedAt},${projects.archivedAt},${teams.retiredAt},${initiatives.archivedAt},${savedViews.archivedAt}) IS NOT NULL OR (${favorites.issueId} IS NOT NULL AND EXISTS(SELECT 1 FROM teams parent_team WHERE parent_team.id=${issues.teamId} AND parent_team.retired_at IS NOT NULL)) OR (${favorites.issueId} IS NOT NULL AND EXISTS(SELECT 1 FROM projects parent_project WHERE parent_project.id=${issues.projectId} AND parent_project.archived_at IS NOT NULL)) OR (${favorites.viewId} IS NOT NULL AND (EXISTS(SELECT 1 FROM teams parent_team WHERE parent_team.id=coalesce(${savedViews.teamId},${savedViews.filters}->>'teamId') AND parent_team.retired_at IS NOT NULL) OR EXISTS(SELECT 1 FROM projects parent_project WHERE parent_project.id=coalesce(${savedViews.projectId},${savedViews.filters}->>'projectId') AND (parent_project.archived_at IS NOT NULL OR parent_project.deleted_at IS NOT NULL))))`;
    const state = sql<
      'AVAILABLE' | 'ARCHIVED' | 'UNAVAILABLE'
    >`CASE WHEN NOT (${allowed}) THEN 'UNAVAILABLE' WHEN ${archived} THEN 'ARCHIVED' ELSE 'AVAILABLE' END`;
    const scope = and(
      eq(favorites.workspaceId, w),
      eq(favorites.membershipId, memberId),
    );
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(favorites)
      .where(scope);
    const rows = await tx
      .select({
        id: favorites.id,
        revision: favorites.revision,
        position: favorites.position,
        targetType: type,
        targetId,
        title,
        state,
      })
      .from(favorites)
      .leftJoin(issues, eq(issues.id, favorites.issueId))
      .leftJoin(projects, eq(projects.id, favorites.projectId))
      .leftJoin(teams, eq(teams.id, favorites.teamId))
      .leftJoin(initiatives, eq(initiatives.id, favorites.initiativeId))
      .leftJoin(savedViews, eq(savedViews.id, favorites.viewId))
      .where(
        and(
          scope,
          cursor
            ? sql`(${favorites.position},${favorites.id})>(${cursor.position}::int,${cursor.id})`
            : undefined,
        ),
      )
      .orderBy(asc(favorites.position), asc(favorites.id))
      .limit(limit + 1);
    return { rows, total: count?.total ?? 0 };
  }
}
