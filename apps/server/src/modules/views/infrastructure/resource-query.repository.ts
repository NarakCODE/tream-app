import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import {
  issues,
  issueStatuses,
  projects,
  projectStatuses,
  documents,
  initiatives,
  issueLabels,
  projectLabels,
  teams,
} from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { issueVisibility } from '../../issues/infrastructure/issue.repository';
import { documentVisibility } from '../../documents/infrastructure/document-visibility';
import { projectVisibility } from './view-visibility';
import type { ViewFilter, ViewResource } from '../domain/view-filter';
import type { QueryCursor } from './query-cursor';
export interface QueryResultRow {
  kind: 'issue' | 'project' | 'document';
  id: string;
  title: string;
  snippet: string;
  createdAt: Date;
  updatedAt: Date;
  position: string;
}
export function textPattern(text: string) {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
function activeIssueParents() {
  return sql`EXISTS(SELECT 1 FROM ${teams} active_team WHERE active_team.id=${issues.teamId} AND active_team.retired_at IS NULL) AND (${issues.projectId} IS NULL OR EXISTS(SELECT 1 FROM ${projects} active_project WHERE active_project.id=${issues.projectId} AND active_project.archived_at IS NULL AND active_project.deleted_at IS NULL)) AND NOT EXISTS(WITH RECURSIVE parents AS(SELECT p.id,p.parent_id,p.archived_at,p.deleted_at,ARRAY[p.id] path,1 depth FROM ${issues} p WHERE p.id=${issues.parentId} UNION ALL SELECT p.id,p.parent_id,p.archived_at,p.deleted_at,parents.path||p.id,parents.depth+1 FROM ${issues} p JOIN parents ON p.id=parents.parent_id WHERE NOT p.id=ANY(parents.path) AND parents.depth<1000) SELECT 1 FROM parents WHERE archived_at IS NOT NULL OR deleted_at IS NOT NULL OR depth>=1000)`;
}
@Injectable()
export class ResourceQueryRepository {
  private issueSelect(
    workspaceId: string,
    memberId: string,
    guest: boolean,
    filter: ViewFilter,
  ): SQL {
    const where = and(
      eq(issues.workspaceId, workspaceId),
      isNull(issues.archivedAt),
      isNull(issues.deletedAt),
      issueVisibility(memberId, guest),
      activeIssueParents(),
      filter.teamId ? eq(issues.teamId, filter.teamId) : undefined,
      filter.projectId ? eq(issues.projectId, filter.projectId) : undefined,
      filter.statusId ? eq(issues.statusId, filter.statusId) : undefined,
      filter.assigneeId ? eq(issues.assigneeId, filter.assigneeId) : undefined,
      filter.statusCategory
        ? eq(
            issueStatuses.category,
            filter.statusCategory as (typeof issueStatuses.$inferSelect)['category'],
          )
        : undefined,
      filter.labelId
        ? sql`EXISTS(SELECT 1 FROM ${issueLabels} matching_label WHERE matching_label.issue_id=${issues.id} AND matching_label.label_id=${filter.labelId})`
        : undefined,
      filter.text
        ? sql`(${issues.title} ILIKE ${textPattern(filter.text)} OR coalesce(${issues.description},'') ILIKE ${textPattern(filter.text)} OR ${issues.identifier} ILIKE ${textPattern(filter.text)})`
        : undefined,
    );
    return sql`SELECT 'issue'::text kind,${issues.id} id,${issues.title} title,left(coalesce(${issues.description},''),160) snippet,${issues.createdAt} created_at,${issues.updatedAt} updated_at FROM ${issues} JOIN ${issueStatuses} ON ${issueStatuses.id}=${issues.statusId} WHERE ${where}`;
  }
  private projectSelect(
    workspaceId: string,
    memberId: string,
    guest: boolean,
    filter: ViewFilter,
  ): SQL {
    const where = and(
      eq(projects.workspaceId, workspaceId),
      isNull(projects.archivedAt),
      isNull(projects.deletedAt),
      projectVisibility(memberId, guest),
      sql`NOT EXISTS(SELECT 1 FROM project_teams p_scope JOIN teams t_scope ON t_scope.id=p_scope.team_id WHERE p_scope.project_id=${projects.id} AND t_scope.retired_at IS NOT NULL)`,
      filter.teamId
        ? sql`EXISTS(SELECT 1 FROM project_teams matching_team WHERE matching_team.project_id=${projects.id} AND matching_team.team_id=${filter.teamId})`
        : undefined,
      filter.statusId ? eq(projects.statusId, filter.statusId) : undefined,
      filter.statusCategory
        ? eq(
            projectStatuses.category,
            filter.statusCategory as (typeof projectStatuses.$inferSelect)['category'],
          )
        : undefined,
      filter.labelId
        ? sql`EXISTS(SELECT 1 FROM ${projectLabels} matching_label WHERE matching_label.project_id=${projects.id} AND matching_label.label_id=${filter.labelId})`
        : undefined,
      filter.text
        ? sql`(${projects.name} ILIKE ${textPattern(filter.text)} OR coalesce(${projects.summary},'') ILIKE ${textPattern(filter.text)})`
        : undefined,
    );
    return sql`SELECT 'project'::text kind,${projects.id} id,${projects.name} title,left(coalesce(${projects.summary},''),160) snippet,${projects.createdAt} created_at,${projects.updatedAt} updated_at FROM ${projects} JOIN ${projectStatuses} ON ${projectStatuses.id}=${projects.statusId} WHERE ${where}`;
  }
  private documentSelect(
    workspaceId: string,
    memberId: string,
    guest: boolean,
    text: string,
  ): SQL {
    const where = and(
      eq(documents.workspaceId, workspaceId),
      isNull(documents.archivedAt),
      isNull(documents.deletedAt),
      documentVisibility(memberId, guest),
      sql`(${documents.teamId} IS NULL OR EXISTS(SELECT 1 FROM ${teams} t_parent WHERE t_parent.id=${documents.teamId} AND t_parent.retired_at IS NULL)) AND (${documents.projectId} IS NULL OR EXISTS(SELECT 1 FROM ${projects} p_parent WHERE p_parent.id=${documents.projectId} AND p_parent.archived_at IS NULL AND p_parent.deleted_at IS NULL)) AND (${documents.initiativeId} IS NULL OR EXISTS(SELECT 1 FROM ${initiatives} i_parent WHERE i_parent.id=${documents.initiativeId} AND i_parent.archived_at IS NULL AND i_parent.deleted_at IS NULL))`,
      sql`(${documents.title} ILIKE ${textPattern(text)} OR ${documents.body} ILIKE ${textPattern(text)})`,
    );
    return sql`SELECT 'document'::text kind,${documents.id} id,${documents.title} title,left(${documents.body},160) snippet,${documents.createdAt} created_at,${documents.updatedAt} updated_at FROM ${documents} WHERE ${where}`;
  }
  async query(
    tx: Tx,
    workspaceId: string,
    memberId: string,
    guest: boolean,
    resource: ViewResource | 'ALL' | 'DOCUMENTS',
    filter: ViewFilter,
    limit: number,
    cursor?: QueryCursor,
  ) {
    const selects: SQL[] = [];
    if (resource === 'ISSUES' || resource === 'ALL')
      selects.push(this.issueSelect(workspaceId, memberId, guest, filter));
    if (resource === 'PROJECTS' || resource === 'ALL')
      selects.push(this.projectSelect(workspaceId, memberId, guest, filter));
    if (resource === 'DOCUMENTS' || resource === 'ALL')
      selects.push(
        this.documentSelect(workspaceId, memberId, guest, filter.text ?? ''),
      );
    const source = sql.join(selects, sql` UNION ALL `);
    const position =
      filter.sort === 'TITLE_ASC'
        ? sql`lower(title)`
        : filter.sort === 'UPDATED_DESC'
          ? sql`date_trunc('milliseconds',updated_at)`
          : sql`date_trunc('milliseconds',created_at)`;
    const ascending = filter.sort === 'TITLE_ASC';
    const value = cursor
      ? ascending
        ? sql`${cursor.position}::text`
        : sql`${cursor.position}::timestamptz`
      : undefined;
    const seek = cursor
      ? ascending
        ? sql`(${position},kind,id)>(${value},${cursor.kind},${cursor.id})`
        : sql`(${position},kind,id)<(${value},${cursor.kind},${cursor.id})`
      : sql`true`;
    const count = await tx.execute<{ total: number }>(
      sql`WITH matches AS(${source}) SELECT count(*)::int total FROM matches`,
    );
    const result = await tx.execute<{
      kind: QueryResultRow['kind'];
      id: string;
      title: string;
      snippet: string;
      created_at: Date | string;
      updated_at: Date | string;
      position: string | Date;
    }>(
      sql`WITH matches AS(${source}) SELECT *,${position} position FROM matches WHERE ${seek} ORDER BY ${position} ${ascending ? sql`ASC` : sql`DESC`},kind ${ascending ? sql`ASC` : sql`DESC`},id ${ascending ? sql`ASC` : sql`DESC`} LIMIT ${limit + 1}`,
    );
    return {
      total: count.rows[0]?.total ?? 0,
      rows: result.rows.map((row) => ({
        kind: row.kind,
        id: row.id,
        title: row.title,
        snippet: row.snippet,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        position:
          filter.sort === 'TITLE_ASC'
            ? String(row.position)
            : new Date(row.position).toISOString(),
      })),
    };
  }
}
