import type { CursorTuple } from '../../../../common/pagination/cursor';
import type { WorkspaceRole } from '../../../iam/domain/workspace-membership';
import type { IssueStatus } from '../../domain/issue';
import type {
  Team,
  TeamMemberDetails,
  TeamMembership,
} from '../../domain/team';

export const TEAMS_REPOSITORY = Symbol('TEAMS_REPOSITORY');

export interface TeamPage {
  items: Team[];
  hasNext: boolean;
  total: number;
}

export interface ListTeamsInput {
  workspaceId: string;
  cursor: CursorTuple | null;
  limit: number;
  includeRetired?: boolean | undefined;
}

export interface TeamAccess {
  team: Team;
  role: WorkspaceRole;
  isTeamMember: boolean;
}

export interface CreateTeamInput {
  workspaceId: string;
  actorUserId: string;
  name: string;
  key: string;
  description?: string | null | undefined;
  timezone?: string | undefined;
  cycleDurationWeeks?: number | undefined;
  cycleStartDay?: number | undefined;
  cycleCooldownDays?: number | undefined;
  upcomingCyclesCount?: number | undefined;
  cyclesEnabled?: boolean | undefined;
  idempotencyKey?: string | null | undefined;
}

export type CreateTeamResult =
  | { type: 'created'; team: Team; defaultStatuses: IssueStatus[] }
  | { type: 'conflict'; message: string }
  | { type: 'forbidden' }
  | { type: 'workspace_not_found' };

export interface UpdateTeamInput {
  teamId: string;
  actorUserId: string;
  changes: {
    name?: string | undefined;
    key?: string | undefined;
    description?: string | null | undefined;
    timezone?: string | undefined;
  };
  updatedAt: Date;
  idempotencyKey?: string | null | undefined;
}

export type UpdateTeamResult =
  | { type: 'updated'; team: Team }
  | { type: 'unchanged'; team: Team }
  | { type: 'conflict'; message: string }
  | { type: 'forbidden' }
  | { type: 'not_found' };

export interface RetireTeamInput {
  teamId: string;
  actorUserId: string;
  retiredAt: Date;
  idempotencyKey?: string | null | undefined;
}

export type RetireTeamResult =
  | { type: 'retired'; team: Team }
  | { type: 'forbidden' }
  | { type: 'not_found' };

export interface RestoreTeamInput {
  teamId: string;
  actorUserId: string;
  idempotencyKey?: string | null | undefined;
}

export type RestoreTeamResult =
  | { type: 'restored'; team: Team }
  | { type: 'conflict'; message: string }
  | { type: 'forbidden' }
  | { type: 'not_found' };

export interface AddTeamMemberInput {
  teamId: string;
  actorUserId: string;
  membershipId: string;
  idempotencyKey?: string | null | undefined;
}

export type AddTeamMemberResult =
  | { type: 'added'; membership: TeamMembership }
  | { type: 'already_member'; membership: TeamMembership }
  | { type: 'reference_not_found' }
  | { type: 'forbidden' }
  | { type: 'not_found' };

export interface RemoveTeamMemberInput {
  teamId: string;
  actorUserId: string;
  membershipId: string;
  idempotencyKey?: string | null | undefined;
}

export type RemoveTeamMemberResult =
  { type: 'removed' } | { type: 'forbidden' } | { type: 'not_found' };

export interface UpdateCycleSettingsInput {
  teamId: string;
  actorUserId: string;
  settings: {
    cyclesEnabled?: boolean | undefined;
    cycleDurationWeeks?: number | undefined;
    cycleStartDay?: number | undefined;
    cycleCooldownDays?: number | undefined;
    upcomingCyclesCount?: number | undefined;
    timezone?: string | undefined;
  };
  updatedAt: Date;
  idempotencyKey?: string | null | undefined;
}

export type UpdateCycleSettingsResult =
  | { type: 'updated'; team: Team }
  | { type: 'forbidden' }
  | { type: 'not_found' };

export interface TeamsRepository {
  list(input: ListTeamsInput): Promise<TeamPage>;
  findById(teamId: string): Promise<Team | null>;
  findAccess(teamId: string, userId: string): Promise<TeamAccess | null>;
  create(input: CreateTeamInput): Promise<CreateTeamResult>;
  update(input: UpdateTeamInput): Promise<UpdateTeamResult>;
  retire(input: RetireTeamInput): Promise<RetireTeamResult>;
  restore(input: RestoreTeamInput): Promise<RestoreTeamResult>;
  listMembers(teamId: string): Promise<TeamMemberDetails[]>;
  addMember(input: AddTeamMemberInput): Promise<AddTeamMemberResult>;
  removeMember(input: RemoveTeamMemberInput): Promise<RemoveTeamMemberResult>;
  listStatuses(teamId: string): Promise<IssueStatus[]>;
  updateCycleSettings(
    input: UpdateCycleSettingsInput,
  ): Promise<UpdateCycleSettingsResult>;
}
