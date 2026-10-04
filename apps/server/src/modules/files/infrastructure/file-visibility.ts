import { sql, type SQL } from 'drizzle-orm';
import { files } from '../../../database/schema';
import { documentVisibility } from '../../documents/infrastructure/document-visibility';
/** The intent target is a permanent authorization anchor, even after detachment. */
export function sourceVisibility(memberId: string, role: string): SQL {
  const project = (id: SQL) =>
    sql`EXISTS (SELECT 1 FROM projects p WHERE p.id=${id} AND p.deleted_at IS NULL AND ${role}<>'GUEST' AND NOT EXISTS(SELECT 1 FROM project_teams pt JOIN teams t ON t.id=pt.team_id WHERE pt.project_id=p.id AND t.visibility='PRIVATE' AND NOT EXISTS(SELECT 1 FROM team_memberships tm WHERE tm.team_id=t.id AND tm.membership_id=${memberId})))`;
  const issue = (
    id: SQL,
  ) => sql`EXISTS (SELECT 1 FROM issues i WHERE i.id=${id} AND i.deleted_at IS NULL AND NOT EXISTS (
 WITH RECURSIVE ancestry AS (SELECT i.id,i.team_id,i.project_id,i.parent_id,0 AS depth UNION ALL SELECT p.id,p.team_id,p.project_id,p.parent_id,a.depth+1 FROM issues p JOIN ancestry a ON p.id=a.parent_id WHERE a.depth<1000)
 SELECT 1 FROM ancestry a JOIN teams t ON t.id=a.team_id WHERE a.depth>=1000 OR NOT((${role}<>'GUEST' AND t.visibility='WORKSPACE') OR EXISTS(SELECT 1 FROM team_memberships tm WHERE tm.team_id=t.id AND tm.membership_id=${memberId})) OR (a.project_id IS NOT NULL AND (${role}='GUEST' OR EXISTS(SELECT 1 FROM project_teams pt JOIN teams ptm ON ptm.id=pt.team_id WHERE pt.project_id=a.project_id AND ptm.visibility='PRIVATE' AND NOT EXISTS(SELECT 1 FROM team_memberships tm WHERE tm.team_id=ptm.id AND tm.membership_id=${memberId}))))
 ))`;
  const document = (id: SQL) =>
    sql`EXISTS (SELECT 1 FROM documents WHERE documents.id=${id} AND documents.workspace_id=${files.workspaceId} AND documents.deleted_at IS NULL AND ${documentVisibility(memberId, role)})`;
  const initiative = (id: SQL) =>
    sql`EXISTS (SELECT 1 FROM initiatives i WHERE i.id=${id} AND i.workspace_id=${files.workspaceId} AND i.deleted_at IS NULL AND ${role}<>'GUEST' AND NOT EXISTS(SELECT 1 FROM initiative_projects ip JOIN project_teams pt ON pt.project_id=ip.project_id JOIN teams t ON t.id=pt.team_id WHERE ip.initiative_id=i.id AND t.visibility='PRIVATE' AND NOT EXISTS(SELECT 1 FROM team_memberships tm WHERE tm.team_id=t.id AND tm.membership_id=${memberId})))`;
  return sql`EXISTS(SELECT 1 FROM attachments origin WHERE origin.id=${files.sourceAttachmentId} AND origin.file_id=${files.id} AND (
 (origin.issue_id IS NOT NULL AND ${issue(sql`origin.issue_id`)}) OR (origin.project_id IS NOT NULL AND ${project(sql`origin.project_id`)}) OR
 (origin.document_id IS NOT NULL AND ${document(sql`origin.document_id`)}) OR
 (origin.comment_id IS NOT NULL AND EXISTS(SELECT 1 FROM comments c WHERE c.id=origin.comment_id AND c.deleted_at IS NULL AND ((c.issue_id IS NOT NULL AND ${issue(sql`c.issue_id`)}) OR (c.project_id IS NOT NULL AND ${project(sql`c.project_id`)}) OR (c.project_update_id IS NOT NULL AND EXISTS(SELECT 1 FROM project_updates pu WHERE pu.id=c.project_update_id AND pu.deleted_at IS NULL AND ${project(sql`pu.project_id`)})) OR (c.initiative_id IS NOT NULL AND ${initiative(sql`c.initiative_id`)}) OR (c.initiative_update_id IS NOT NULL AND EXISTS(SELECT 1 FROM initiative_updates iu WHERE iu.id=c.initiative_update_id AND iu.deleted_at IS NULL AND ${initiative(sql`iu.initiative_id`)})))))
 ))`;
}
