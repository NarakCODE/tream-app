import { sql } from 'drizzle-orm';
import {
  initiatives,
  initiativeProjects,
  projectTeams,
  teams,
  teamMemberships,
} from '../../../database/schema';
/** Used before pagination/counts; a visible initiative requires every private project team. */
export function initiativeVisibility(membershipId: string, guest = false) {
  if (guest) return sql`false`;
  return sql`NOT EXISTS(SELECT 1 FROM ${initiativeProjects} ip JOIN ${projectTeams} pt ON pt.project_id=ip.project_id JOIN ${teams} t ON t.id=pt.team_id WHERE ip.initiative_id=${initiatives.id} AND t.visibility='PRIVATE' AND NOT EXISTS(SELECT 1 FROM ${teamMemberships} tm WHERE tm.team_id=t.id AND tm.membership_id=${membershipId}))`;
}
