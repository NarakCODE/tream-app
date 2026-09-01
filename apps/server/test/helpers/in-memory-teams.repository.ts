import { ulid } from 'ulid';
import type {
  AddTeamMemberInput,
  AddTeamMemberResult,
  CreateTeamInput,
  CreateTeamResult,
  ListTeamsInput,
  RemoveTeamMemberInput,
  RemoveTeamMemberResult,
  RestoreTeamInput,
  RestoreTeamResult,
  RetireTeamInput,
  RetireTeamResult,
  TeamAccess,
  TeamPage,
  TeamsRepository,
  UpdateCycleSettingsInput,
  UpdateCycleSettingsResult,
  UpdateTeamInput,
  UpdateTeamResult,
} from '../../src/modules/work-management/application/ports/teams-repository.port';
import { calculateNextCycles } from '../../src/modules/work-management/domain/cycle-calculator';
import {
  DEFAULT_TEAM_STATUSES,
  type Team,
  type TeamMemberDetails,
  type TeamMembership,
} from '../../src/modules/work-management/domain/team';
import type { IssueStatus } from '../../src/modules/work-management/domain/issue';
import type { Cycle } from '../../src/modules/work-management/domain/cycle';
import {
  canAdministerWorkManagement,
  canJoinTeam,
} from '../../src/modules/work-management/domain/work-management-roles';
import type { InMemoryWorkspaceRepository } from './in-memory-workspace.repository';
import type { InMemoryAuthRepository } from './in-memory-auth.repository';

export class InMemoryTeamsRepository implements TeamsRepository {
  public readonly teams = new Map<string, Team>();
  public readonly memberships = new Map<string, TeamMembership>();
  public readonly statuses = new Map<string, IssueStatus>();
  public readonly cycles = new Map<string, Cycle>();
  private cyclesRepository?: { cycles: Map<string, Cycle> };

  constructor(
    private readonly workspaceRepository: InMemoryWorkspaceRepository,
    private readonly authRepository: InMemoryAuthRepository,
  ) {}

  setCyclesRepository(repo: { cycles: Map<string, Cycle> }): void {
    this.cyclesRepository = repo;
  }

  reset(): void {
    this.teams.clear();
    this.memberships.clear();
    this.statuses.clear();
    this.cycles.clear();
  }

  list(input: ListTeamsInput): Promise<TeamPage> {
    const all = [...this.teams.values()]
      .filter(
        (t) =>
          t.workspaceId === input.workspaceId &&
          (input.includeRetired ? true : t.retiredAt === null),
      )
      .sort((a, b) => {
        const diff = b.createdAt.getTime() - a.createdAt.getTime();
        return diff !== 0 ? diff : b.id.localeCompare(a.id);
      });

    const afterCursor =
      input.cursor === null
        ? all
        : all.filter(
            (t) =>
              t.createdAt < input.cursor!.createdAt ||
              (t.createdAt.getTime() === input.cursor!.createdAt.getTime() &&
                t.id < input.cursor!.id),
          );

    return Promise.resolve({
      items: afterCursor.slice(0, input.limit),
      hasNext: afterCursor.length > input.limit,
      total: all.length,
    });
  }

  findById(teamId: string): Promise<Team | null> {
    return Promise.resolve(this.teams.get(teamId) ?? null);
  }

  async findAccess(teamId: string, userId: string): Promise<TeamAccess | null> {
    const team = this.teams.get(teamId);
    if (!team) return null;

    const access = await this.workspaceRepository.findActiveWorkspaceMembership(
      team.workspaceId,
      userId,
    );
    if (!access) return null;

    const isTeamMember = [...this.memberships.values()].some(
      (m) => m.teamId === teamId && m.membershipId === access.membership.id,
    );

    return {
      team,
      role: access.membership.role,
      isTeamMember,
    };
  }

  async create(input: CreateTeamInput): Promise<CreateTeamResult> {
    const access = await this.workspaceRepository.findActiveWorkspaceMembership(
      input.workspaceId,
      input.actorUserId,
    );
    if (!access) return { type: 'workspace_not_found' };
    if (!canAdministerWorkManagement(access.membership.role)) {
      return { type: 'forbidden' };
    }

    const keyConflict = [...this.teams.values()].find(
      (t) =>
        t.workspaceId === input.workspaceId &&
        t.key === input.key &&
        t.retiredAt === null,
    );
    if (keyConflict) {
      return {
        type: 'conflict',
        message: `A team with key '${input.key}' already exists in this workspace.`,
      };
    }

    const teamId = `tem_${ulid()}`;
    const now = new Date();
    const team: Team = {
      id: teamId,
      workspaceId: input.workspaceId,
      name: input.name,
      key: input.key,
      description: input.description ?? null,
      timezone: input.timezone ?? 'UTC',
      cycleDurationWeeks: input.cycleDurationWeeks ?? 2,
      cycleStartDay: input.cycleStartDay ?? 1,
      cycleCooldownDays: input.cycleCooldownDays ?? 0,
      upcomingCyclesCount: input.upcomingCyclesCount ?? 3,
      cyclesEnabled: input.cyclesEnabled ?? false,
      nextIssueNumber: 1,
      createdAt: now,
      updatedAt: now,
      retiredAt: null,
    };
    this.teams.set(team.id, team);

    const membership: TeamMembership = {
      id: `tmb_${ulid()}`,
      teamId: team.id,
      membershipId: access.membership.id,
      createdAt: now,
      updatedAt: now,
    };
    this.memberships.set(membership.id, membership);

    const defaultStatuses: IssueStatus[] = DEFAULT_TEAM_STATUSES.map(
      (status) => {
        const item: IssueStatus = {
          id: `ist_${ulid()}`,
          teamId: team.id,
          name: status.name,
          category: status.category,
          position: status.position,
          isDefault: status.isDefault,
          createdAt: now,
          updatedAt: now,
        };
        this.statuses.set(item.id, item);
        return item;
      },
    );

    if (team.cyclesEnabled) {
      const drafts = calculateNextCycles(team, [], now);
      for (const d of drafts) {
        const c: Cycle = {
          id: `cyc_${ulid()}`,
          teamId: team.id,
          number: d.number,
          name: d.name,
          startsAt: d.startsAt,
          endsAt: d.endsAt,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        this.cycles.set(c.id, c);
        if (this.cyclesRepository) {
          this.cyclesRepository.cycles.set(c.id, c);
        }
      }
    }

    return { type: 'created', team, defaultStatuses };
  }

  async update(input: UpdateTeamInput): Promise<UpdateTeamResult> {
    const access = await this.findAccess(input.teamId, input.actorUserId);
    if (!access) return { type: 'not_found' };
    if (!canAdministerWorkManagement(access.role)) return { type: 'forbidden' };

    if (input.changes.key && input.changes.key !== access.team.key) {
      const keyConflict = [...this.teams.values()].find(
        (t) =>
          t.workspaceId === access.team.workspaceId &&
          t.key === input.changes.key &&
          t.retiredAt === null,
      );
      if (keyConflict) {
        return {
          type: 'conflict',
          message: `A team with key '${input.changes.key}' already exists in this workspace.`,
        };
      }
    }

    const updated: Team = {
      ...access.team,
      ...(input.changes.name !== undefined ? { name: input.changes.name } : {}),
      ...(input.changes.key !== undefined ? { key: input.changes.key } : {}),
      ...(input.changes.description !== undefined
        ? { description: input.changes.description }
        : {}),
      ...(input.changes.timezone !== undefined
        ? { timezone: input.changes.timezone }
        : {}),
      updatedAt: input.updatedAt,
    };
    this.teams.set(updated.id, updated);
    return { type: 'updated', team: updated };
  }

  async retire(input: RetireTeamInput): Promise<RetireTeamResult> {
    const access = await this.findAccess(input.teamId, input.actorUserId);
    if (!access) return { type: 'not_found' };
    if (!canAdministerWorkManagement(access.role)) return { type: 'forbidden' };

    const updated: Team = {
      ...access.team,
      retiredAt: input.retiredAt,
      updatedAt: input.retiredAt,
    };
    this.teams.set(updated.id, updated);
    return { type: 'retired', team: updated };
  }

  async restore(input: RestoreTeamInput): Promise<RestoreTeamResult> {
    const access = await this.findAccess(input.teamId, input.actorUserId);
    if (!access) return { type: 'not_found' };
    if (!canAdministerWorkManagement(access.role)) return { type: 'forbidden' };

    const keyConflict = [...this.teams.values()].find(
      (t) =>
        t.workspaceId === access.team.workspaceId &&
        t.key === access.team.key &&
        t.retiredAt === null,
    );
    if (keyConflict) {
      return {
        type: 'conflict',
        message: `Another active team in this workspace is using key '${access.team.key}'.`,
      };
    }

    const updated: Team = {
      ...access.team,
      retiredAt: null,
      updatedAt: new Date(),
    };
    this.teams.set(updated.id, updated);
    return { type: 'restored', team: updated };
  }

  async listMembers(teamId: string): Promise<TeamMemberDetails[]> {
    const memberships = [...this.memberships.values()].filter(
      (m) => m.teamId === teamId,
    );
    const result: TeamMemberDetails[] = [];
    for (const m of memberships) {
      const team = this.teams.get(teamId);
      if (!team) continue;
      const wsMember = await this.workspaceRepository.findWorkspaceMember(
        team.workspaceId,
        m.membershipId,
      );
      if (!wsMember) continue;
      const user = await this.authRepository.findUserById(wsMember.userId);
      if (!user) continue;

      result.push({
        id: m.id,
        teamId: m.teamId,
        membershipId: m.membershipId,
        userId: user.id,
        fullName: user.fullName,
        email: user.email,
        role: wsMember.role,
        createdAt: m.createdAt,
      });
    }
    return result;
  }

  async addMember(input: AddTeamMemberInput): Promise<AddTeamMemberResult> {
    const team = this.teams.get(input.teamId);
    if (!team) return { type: 'not_found' };

    const actorAccess =
      await this.workspaceRepository.findActiveWorkspaceMembership(
        team.workspaceId,
        input.actorUserId,
      );
    if (!actorAccess || !canJoinTeam(actorAccess.membership.role)) {
      return { type: 'forbidden' };
    }

    const targetMember = await this.workspaceRepository.findWorkspaceMember(
      team.workspaceId,
      input.membershipId,
    );
    if (!targetMember || targetMember.role === 'GUEST') {
      return { type: 'reference_not_found' };
    }

    const existing = [...this.memberships.values()].find(
      (m) => m.teamId === input.teamId && m.membershipId === input.membershipId,
    );
    if (existing) {
      return { type: 'already_member', membership: existing };
    }

    const membership: TeamMembership = {
      id: `tmb_${ulid()}`,
      teamId: input.teamId,
      membershipId: input.membershipId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.memberships.set(membership.id, membership);
    return { type: 'added', membership };
  }

  async removeMember(
    input: RemoveTeamMemberInput,
  ): Promise<RemoveTeamMemberResult> {
    const team = this.teams.get(input.teamId);
    if (!team) return { type: 'not_found' };

    const actorAccess =
      await this.workspaceRepository.findActiveWorkspaceMembership(
        team.workspaceId,
        input.actorUserId,
      );
    if (!actorAccess) return { type: 'forbidden' };

    const canRemove =
      canAdministerWorkManagement(actorAccess.membership.role) ||
      actorAccess.membership.id === input.membershipId;
    if (!canRemove) return { type: 'forbidden' };

    const membership = [...this.memberships.values()].find(
      (m) => m.teamId === input.teamId && m.membershipId === input.membershipId,
    );
    if (!membership) return { type: 'not_found' };

    this.memberships.delete(membership.id);
    return { type: 'removed' };
  }

  listStatuses(teamId: string): Promise<IssueStatus[]> {
    return Promise.resolve(
      [...this.statuses.values()]
        .filter((s) => s.teamId === teamId)
        .sort((a, b) => a.position - b.position),
    );
  }

  async updateCycleSettings(
    input: UpdateCycleSettingsInput,
  ): Promise<UpdateCycleSettingsResult> {
    const access = await this.findAccess(input.teamId, input.actorUserId);
    if (!access) return { type: 'not_found' };
    if (!canAdministerWorkManagement(access.role)) return { type: 'forbidden' };

    const updated: Team = {
      ...access.team,
      ...(input.settings.cyclesEnabled !== undefined
        ? { cyclesEnabled: input.settings.cyclesEnabled }
        : {}),
      ...(input.settings.cycleDurationWeeks !== undefined
        ? { cycleDurationWeeks: input.settings.cycleDurationWeeks }
        : {}),
      ...(input.settings.cycleStartDay !== undefined
        ? { cycleStartDay: input.settings.cycleStartDay }
        : {}),
      ...(input.settings.cycleCooldownDays !== undefined
        ? { cycleCooldownDays: input.settings.cycleCooldownDays }
        : {}),
      ...(input.settings.upcomingCyclesCount !== undefined
        ? { upcomingCyclesCount: input.settings.upcomingCyclesCount }
        : {}),
      ...(input.settings.timezone !== undefined
        ? { timezone: input.settings.timezone }
        : {}),
      updatedAt: input.updatedAt,
    };
    this.teams.set(updated.id, updated);

    if (updated.cyclesEnabled) {
      const existing = [...this.cycles.values()].filter(
        (c) => c.teamId === updated.id,
      );
      const drafts = calculateNextCycles(updated, existing, input.updatedAt);
      for (const d of drafts) {
        const c: Cycle = {
          id: `cyc_${ulid()}`,
          teamId: updated.id,
          number: d.number,
          name: d.name,
          startsAt: d.startsAt,
          endsAt: d.endsAt,
          completedAt: null,
          createdAt: input.updatedAt,
          updatedAt: input.updatedAt,
        };
        this.cycles.set(c.id, c);
        if (this.cyclesRepository) {
          this.cyclesRepository.cycles.set(c.id, c);
        }
      }
    }

    return { type: 'updated', team: updated };
  }
}
