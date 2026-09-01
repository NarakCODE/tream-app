import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import { ResourceConflictException } from '../../../common/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import type { IssueStatus } from '../domain/issue';
import {
  normalizeTeamKey,
  type Team,
  type TeamMemberDetails,
  type TeamMembership,
} from '../domain/team';
import {
  TEAMS_REPOSITORY,
  type TeamsRepository,
} from './ports/teams-repository.port';

export interface ListTeamsQuery {
  cursor?: string;
  limit: number;
  includeRetired?: boolean;
}

export interface CreateTeamCommand {
  name: string;
  key: string;
  description?: string | null;
  timezone?: string;
  cycleDurationWeeks?: number;
  cycleStartDay?: number;
  cycleCooldownDays?: number;
  upcomingCyclesCount?: number;
  cyclesEnabled?: boolean;
}

export interface UpdateTeamCommand {
  name?: string;
  key?: string;
  description?: string | null;
  timezone?: string;
}

export interface UpdateCycleSettingsCommand {
  cyclesEnabled?: boolean;
  cycleDurationWeeks?: number;
  cycleStartDay?: number;
  cycleCooldownDays?: number;
  upcomingCyclesCount?: number;
  timezone?: string;
}

@Injectable()
export class TeamsService {
  constructor(
    @Inject(TEAMS_REPOSITORY)
    private readonly repository: TeamsRepository,
  ) {}

  async list(
    workspaceId: string,
    query: ListTeamsQuery,
  ): Promise<CursorPaginatedResult<Team>> {
    const page = await this.repository.list({
      workspaceId,
      cursor: query.cursor === undefined ? null : decodeCursor(query.cursor),
      limit: query.limit,
      ...(query.includeRetired !== undefined
        ? { includeRetired: query.includeRetired }
        : {}),
    });
    const last = page.items.at(-1);
    return {
      paginationType: 'cursor',
      items: page.items,
      cursor: query.cursor ?? null,
      nextCursor:
        page.hasNext && last !== undefined
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
      hasNext: page.hasNext,
      limit: query.limit,
      total: page.total,
    };
  }

  async findById(teamId: string): Promise<Team> {
    const team = await this.repository.findById(teamId);
    if (!team) {
      throw this.forbidden();
    }
    return team;
  }

  async create(
    workspaceId: string,
    actorUserId: string,
    input: CreateTeamCommand,
  ): Promise<Team> {
    const result = await this.repository.create({
      workspaceId,
      actorUserId,
      name: input.name.trim(),
      key: normalizeTeamKey(input.key),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      timezone: input.timezone ?? 'UTC',
      cycleDurationWeeks: input.cycleDurationWeeks ?? 2,
      cycleStartDay: input.cycleStartDay ?? 1,
      cycleCooldownDays: input.cycleCooldownDays ?? 0,
      upcomingCyclesCount: input.upcomingCyclesCount ?? 3,
      cyclesEnabled: input.cyclesEnabled ?? false,
    });

    if (result.type === 'created') {
      return result.team;
    }
    if (result.type === 'conflict') {
      throw new ResourceConflictException(result.message, {
        field: 'key',
        key: input.key,
      });
    }
    throw this.forbidden();
  }

  async update(
    teamId: string,
    actorUserId: string,
    input: UpdateTeamCommand,
  ): Promise<Team> {
    const result = await this.repository.update({
      teamId,
      actorUserId,
      changes: {
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(input.key === undefined
          ? {}
          : { key: normalizeTeamKey(input.key) }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
      },
      updatedAt: new Date(),
    });

    if (result.type === 'updated' || result.type === 'unchanged') {
      return result.team;
    }
    if (result.type === 'conflict') {
      throw new ResourceConflictException(result.message, {
        field: 'key',
      });
    }
    throw this.forbidden();
  }

  async retire(teamId: string, actorUserId: string): Promise<Team> {
    const result = await this.repository.retire({
      teamId,
      actorUserId,
      retiredAt: new Date(),
    });
    if (result.type === 'retired') {
      return result.team;
    }
    throw this.forbidden();
  }

  async restore(teamId: string, actorUserId: string): Promise<Team> {
    const result = await this.repository.restore({
      teamId,
      actorUserId,
    });
    if (result.type === 'restored') {
      return result.team;
    }
    if (result.type === 'conflict') {
      throw new ResourceConflictException(result.message);
    }
    throw this.forbidden();
  }

  async listMembers(teamId: string): Promise<TeamMemberDetails[]> {
    return this.repository.listMembers(teamId);
  }

  async addMember(
    teamId: string,
    actorUserId: string,
    memberId: string,
  ): Promise<TeamMembership> {
    const result = await this.repository.addMember({
      teamId,
      actorUserId,
      membershipId: memberId,
    });
    if (result.type === 'added' || result.type === 'already_member') {
      return result.membership;
    }
    if (result.type === 'reference_not_found') {
      throw new ResourceNotFoundException('Workspace membership', memberId);
    }
    throw this.forbidden();
  }

  async removeMember(
    teamId: string,
    actorUserId: string,
    memberId: string,
  ): Promise<void> {
    const result = await this.repository.removeMember({
      teamId,
      actorUserId,
      membershipId: memberId,
    });
    if (result.type !== 'removed') {
      throw this.forbidden();
    }
  }

  async listStatuses(teamId: string): Promise<IssueStatus[]> {
    return this.repository.listStatuses(teamId);
  }

  async updateCycleSettings(
    teamId: string,
    actorUserId: string,
    input: UpdateCycleSettingsCommand,
  ): Promise<Team> {
    const result = await this.repository.updateCycleSettings({
      teamId,
      actorUserId,
      settings: input,
      updatedAt: new Date(),
    });
    if (result.type === 'updated') {
      return result.team;
    }
    throw this.forbidden();
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this team resource.',
      HttpStatus.FORBIDDEN,
    );
  }
}
