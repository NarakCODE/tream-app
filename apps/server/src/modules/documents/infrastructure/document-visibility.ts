import { sql } from 'drizzle-orm';
import {
  documents,
  initiatives,
  projects,
  projectTeams,
  teams,
  teamMemberships,
} from '../../../database/schema';
import { initiativeVisibility } from '../../initiatives/infrastructure/initiative-visibility';
/** Apply before totals/pagination; mirrors typed owner read authorization. */
export function documentVisibility(
  memberId: string,
  guest: boolean | string = false,
) {
  if (guest === true || guest === 'GUEST') return sql`false`;
  return sql`(
 (${documents.teamId} IS NOT NULL AND EXISTS(SELECT 1 FROM ${teams} t WHERE t.id=${documents.teamId} AND (t.visibility='WORKSPACE' OR EXISTS(SELECT 1 FROM ${teamMemberships} tm WHERE tm.team_id=t.id AND tm.membership_id=${memberId}))))
 OR (${documents.projectId} IS NOT NULL AND EXISTS(SELECT 1 FROM ${projects} p WHERE p.id=${documents.projectId} AND p.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM ${projectTeams} pt JOIN ${teams} t ON t.id=pt.team_id WHERE pt.project_id=p.id AND t.visibility='PRIVATE' AND NOT EXISTS(SELECT 1 FROM ${teamMemberships} tm WHERE tm.team_id=t.id AND tm.membership_id=${memberId}))))
 OR (${documents.initiativeId} IS NOT NULL AND EXISTS(SELECT 1 FROM ${initiatives} WHERE ${initiatives.id}=${documents.initiativeId} AND ${initiatives.deletedAt} IS NULL AND ${initiativeVisibility(memberId)}))
 )`;
}
