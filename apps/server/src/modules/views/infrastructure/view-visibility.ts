import { sql, type SQL } from 'drizzle-orm';
import {
  projects,
  projectTeams,
  teams,
  teamMemberships,
  savedViews,
  issueStatuses,
  labels,
} from '../../../database/schema';
export function teamVisible(id: SQL, memberId: string, guest: boolean) {
  return sql`EXISTS(SELECT 1 FROM ${teams} visible_team WHERE visible_team.id=${id} AND ((${!guest} AND visible_team.visibility='WORKSPACE') OR EXISTS(SELECT 1 FROM ${teamMemberships} visible_share WHERE visible_share.team_id=visible_team.id AND visible_share.membership_id=${memberId})))`;
}
export function projectVisible(id: SQL, memberId: string, guest: boolean) {
  return sql`${!guest} AND EXISTS(SELECT 1 FROM ${projects} visible_project WHERE visible_project.id=${id}) AND NOT EXISTS(SELECT 1 FROM ${projectTeams} visible_link JOIN ${teams} visible_team ON visible_team.id=visible_link.team_id WHERE visible_link.project_id=${id} AND visible_team.visibility='PRIVATE' AND NOT EXISTS(SELECT 1 FROM ${teamMemberships} visible_share WHERE visible_share.team_id=visible_team.id AND visible_share.membership_id=${memberId}))`;
}
export function projectVisibility(memberId: string, guest: boolean) {
  return projectVisible(sql`${projects.id}`, memberId, guest);
}
export function viewVisibility(memberId: string, guest: boolean) {
  const team = sql`coalesce(${savedViews.teamId},${savedViews.filters}->>'teamId')`;
  const project = sql`coalesce(${savedViews.projectId},${savedViews.filters}->>'projectId')`;
  return sql`(${savedViews.ownerId}=${memberId} OR (${!guest} AND ${savedViews.visibility}='WORKSPACE')) AND (${!guest} OR (${savedViews.resource}='ISSUES' AND (${savedViews.filters}->>'assigneeId' IS NULL OR ${savedViews.filters}->>'assigneeId'=${memberId}))) AND (${team} IS NULL OR ${teamVisible(team, memberId, guest)}) AND (${project} IS NULL OR ${projectVisible(project, memberId, guest)}) AND (${savedViews.resource}<>'ISSUES' OR ${savedViews.filters}->>'statusId' IS NULL OR EXISTS(SELECT 1 FROM ${issueStatuses} visible_status WHERE visible_status.id=${savedViews.filters}->>'statusId' AND ${teamVisible(sql`visible_status.team_id`, memberId, guest)})) AND (${savedViews.filters}->>'labelId' IS NULL OR EXISTS(SELECT 1 FROM ${labels} visible_label WHERE visible_label.id=${savedViews.filters}->>'labelId' AND (visible_label.team_id IS NULL OR ${teamVisible(sql`visible_label.team_id`, memberId, guest)})))`;
}
