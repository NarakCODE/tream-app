import { sql, type SQL } from 'drizzle-orm';
import { issues, files } from '../../../database/schema';
import { issueVisibility } from '../../issues/infrastructure/issue.repository';
/** Historical queries retain lifecycle rows but enforce their current private scopes. */
export function resourceVisibility(
  kind: SQL,
  id: SQL,
  workspaceId: string,
  memberId: string,
): SQL {
  const team = (target: SQL) =>
    sql`EXISTS(SELECT 1 FROM teams t WHERE t.id=${target} AND t.workspace_id=${workspaceId} AND (t.visibility='WORKSPACE' OR EXISTS(SELECT 1 FROM team_memberships tm WHERE tm.team_id=t.id AND tm.membership_id=${memberId})))`;
  const project = (target: SQL) =>
    sql`EXISTS(SELECT 1 FROM projects p WHERE p.id=${target} AND p.workspace_id=${workspaceId} AND NOT EXISTS(SELECT 1 FROM project_teams pt JOIN teams t ON t.id=pt.team_id WHERE pt.project_id=p.id AND t.visibility='PRIVATE' AND NOT EXISTS(SELECT 1 FROM team_memberships tm WHERE tm.team_id=t.id AND tm.membership_id=${memberId})))`;
  const initiative = (target: SQL) =>
    sql`EXISTS(SELECT 1 FROM initiatives n WHERE n.id=${target} AND n.workspace_id=${workspaceId} AND NOT EXISTS(SELECT 1 FROM initiative_projects ip JOIN project_teams pt ON pt.project_id=ip.project_id JOIN teams t ON t.id=pt.team_id WHERE ip.initiative_id=n.id AND t.visibility='PRIVATE' AND NOT EXISTS(SELECT 1 FROM team_memberships tm WHERE tm.team_id=t.id AND tm.membership_id=${memberId})))`;
  const issue = (target: SQL) =>
    sql`EXISTS(SELECT 1 FROM ${issues} WHERE ${issues.id}=${target} AND ${issues.workspaceId}=${workspaceId} AND ${issueVisibility(memberId, false)})`;
  const comment = (target: SQL) =>
    sql`EXISTS(SELECT 1 FROM comments c WHERE c.id=${target} AND c.workspace_id=${workspaceId} AND ((c.issue_id IS NOT NULL AND ${issue(sql`c.issue_id`)}) OR(c.project_id IS NOT NULL AND ${project(sql`c.project_id`)}) OR(c.project_update_id IS NOT NULL AND EXISTS(SELECT 1 FROM project_updates u WHERE u.id=c.project_update_id AND ${project(sql`u.project_id`)})) OR(c.initiative_id IS NOT NULL AND ${initiative(sql`c.initiative_id`)}) OR(c.initiative_update_id IS NOT NULL AND EXISTS(SELECT 1 FROM initiative_updates u WHERE u.id=c.initiative_update_id AND ${initiative(sql`u.initiative_id`)}))))`;
  const document = (target: SQL) =>
    sql`EXISTS(SELECT 1 FROM documents d WHERE d.id=${target} AND d.workspace_id=${workspaceId} AND ((d.team_id IS NOT NULL AND ${team(sql`d.team_id`)}) OR(d.project_id IS NOT NULL AND ${project(sql`d.project_id`)}) OR(d.initiative_id IS NOT NULL AND ${initiative(sql`d.initiative_id`)})))`;
  const file = (target: SQL) =>
    sql`EXISTS(SELECT 1 FROM ${files} WHERE ${files.id}=${target} AND ${files.workspaceId}=${workspaceId} AND EXISTS(SELECT 1 FROM attachments origin WHERE origin.id=${files.sourceAttachmentId} AND origin.file_id=${files.id} AND ((origin.issue_id IS NOT NULL AND ${issue(sql`origin.issue_id`)}) OR(origin.project_id IS NOT NULL AND ${project(sql`origin.project_id`)}) OR(origin.comment_id IS NOT NULL AND ${comment(sql`origin.comment_id`)}) OR(origin.document_id IS NOT NULL AND ${document(sql`origin.document_id`)}))))`;
  return sql`(
 (${kind} IN ('workspace','membership','invitation','workspace_invitation','user','auth_session')) OR
 (${kind}='team' AND ${team(id)}) OR (${kind}='issue' AND ${issue(id)}) OR (${kind}='project' AND ${project(id)}) OR
 (${kind}='initiative' AND ${initiative(id)}) OR (${kind}='document' AND ${document(id)}) OR (${kind}='comment' AND ${comment(id)}) OR (${kind}='file' AND ${file(id)}) OR
 (${kind}='attachment' AND EXISTS(SELECT 1 FROM attachments a WHERE a.id=${id} AND a.workspace_id=${workspaceId} AND ${file(sql`a.file_id`)} AND ((a.issue_id IS NOT NULL AND ${issue(sql`a.issue_id`)}) OR(a.project_id IS NOT NULL AND ${project(sql`a.project_id`)}) OR(a.comment_id IS NOT NULL AND ${comment(sql`a.comment_id`)}) OR(a.document_id IS NOT NULL AND ${document(sql`a.document_id`)})))) OR
 (${kind}='project_update' AND EXISTS(SELECT 1 FROM project_updates u WHERE u.id=${id} AND u.workspace_id=${workspaceId} AND ${project(sql`u.project_id`)})) OR
 (${kind}='initiative_update' AND EXISTS(SELECT 1 FROM initiative_updates u WHERE u.id=${id} AND u.workspace_id=${workspaceId} AND ${initiative(sql`u.initiative_id`)})) OR
 (${kind}='label' AND EXISTS(SELECT 1 FROM labels l WHERE l.id=${id} AND l.workspace_id=${workspaceId} AND (l.team_id IS NULL OR ${team(sql`l.team_id`)}))) OR
 (${kind}='issue_template' AND EXISTS(SELECT 1 FROM issue_templates it WHERE it.id=${id} AND it.workspace_id=${workspaceId} AND ${team(sql`it.team_id`)})) OR
 (${kind} IN ('view','saved_view') AND EXISTS(SELECT 1 FROM saved_views v WHERE v.id=${id} AND v.workspace_id=${workspaceId} AND (v.visibility='WORKSPACE' OR v.owner_id=${memberId}) AND (v.team_id IS NULL OR ${team(sql`v.team_id`)}) AND (v.project_id IS NULL OR ${project(sql`v.project_id`)})))
 )`;
}
