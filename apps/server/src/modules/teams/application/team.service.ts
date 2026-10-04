import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../database/database.service';
import { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { TeamRepository } from '../infrastructure/team.repository';
import { TeamAccessService } from './team-access.service';
import { TeamCommandService } from './team-command.service';
import { validateCycleSettings } from '../domain/team-policy';
import type {
  CreateTeamDto,
  UpdateTeamDto,
  TeamSettingsDto,
  AddTeamMemberDto,
} from '../presentation/team.dto';
const initialStatuses = [
  ['Backlog', 'BACKLOG'],
  ['Todo', 'UNSTARTED'],
  ['In Progress', 'STARTED'],
  ['Done', 'COMPLETED'],
  ['Canceled', 'CANCELED'],
  ['Duplicate', 'DUPLICATE'],
] as const;
@Injectable()
export class TeamService {
  constructor(
    private readonly db: DatabaseService,
    private readonly repository: TeamRepository,
    private readonly access: TeamAccessService,
    private readonly workspace: WorkspaceAuthorizationService,
    private readonly commands: CommandBus,
    private readonly teamCommands: TeamCommandService,
  ) {}
  list(userId: string, workspaceId: string, limit: number, cursor?: string) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.workspace.require(
        tx,
        userId,
        workspaceId,
        'workspace.read',
      );
      const { rows, total } = await this.repository.list(
        tx,
        workspaceId,
        member.id,
        member.role === 'GUEST',
        limit + 1,
        cursor ? decodeCursor(cursor) : undefined,
      );
      const items = rows.slice(0, limit);
      return {
        paginationType: 'cursor',
        cursor: cursor ?? null,
        limit,
        total,
        hasNext: rows.length > limit,
        items,
        nextCursor:
          rows.length > limit ? encodeCursor(items[items.length - 1]!) : null,
      };
    });
  }
  get(userId: string, workspaceId: string, teamId: string) {
    return this.db.db.transaction(
      async (tx) =>
        (
          await this.access.require(
            tx,
            userId,
            workspaceId,
            teamId,
            'read',
            false,
            true,
          )
        ).team,
    );
  }
  create(identity: Identity, workspaceId: string, dto: CreateTeamDto) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { member } = await this.workspace.require(
          tx,
          identity.userId,
          workspaceId,
          'team.manage',
        );
        const teamId = randomUUID(),
          defaultStatusId = randomUUID();
        const team = await this.repository.create(tx, {
          id: teamId,
          workspaceId,
          name: dto.name.trim(),
          key: dto.key,
          description: dto.description,
          visibility: dto.visibility ?? 'WORKSPACE',
        });
        await this.repository.addMember(tx, {
          id: randomUUID(),
          workspaceId,
          teamId,
          membershipId: member.id,
          role: 'ADMIN',
        });
        for (const [position, [name, category]] of initialStatuses.entries())
          await this.repository.createStatus(tx, {
            id: category === 'UNSTARTED' ? defaultStatusId : randomUUID(),
            teamId,
            name,
            category,
            position,
            isDefault: category === 'UNSTARTED',
          });
        await this.teamCommands.fact(
          tx,
          workspaceId,
          member.id,
          teamId,
          'team.created',
          {
            team_id: teamId,
            key: team.key,
            default_status_id: defaultStatusId,
          },
        );
        return team;
      },
      {
        statusCode: 201,
        authorize: async (tx) => {
          await this.workspace.require(
            tx,
            identity.userId,
            workspaceId,
            'team.manage',
            { lock: true },
          );
        },
      },
    );
  }
  update(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    dto: UpdateTeamDto,
  ) {
    if (!Object.keys(dto).length)
      throw new BadRequestException('At least one change required.');
    return this.teamCommands.execute(
      identity,
      workspaceId,
      teamId,
      async (tx, actorId) => {
        const result = await this.repository.update(tx, teamId, {
          ...dto,
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        });
        await this.teamCommands.fact(
          tx,
          workspaceId,
          actorId,
          teamId,
          'team.updated',
          { team_id: teamId, changed_fields: Object.keys(dto) },
        );
        return result;
      },
    );
  }
  retire(identity: Identity, workspaceId: string, teamId: string) {
    return this.teamCommands.execute(
      identity,
      workspaceId,
      teamId,
      async (tx, actorId) => {
        if (await this.repository.retirementDependencies(tx, teamId))
          throw new ConflictException(
            'Team has active issues, projects or unfinished cycles.',
          );
        const result = await this.repository.update(tx, teamId, {
          retiredAt: new Date(),
        });
        await this.teamCommands.fact(
          tx,
          workspaceId,
          actorId,
          teamId,
          'team.retired',
          { team_id: teamId, retired_at: result.retiredAt!.toISOString() },
        );
        return result;
      },
      200,
      true,
    );
  }
  members(userId: string, workspaceId: string, teamId: string) {
    return this.db.db.transaction(async (tx) => {
      await this.access.require(
        tx,
        userId,
        workspaceId,
        teamId,
        'read',
        false,
        true,
      );
      return this.repository.members(tx, teamId);
    });
  }
  addMember(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    dto: AddTeamMemberDto,
  ) {
    return this.teamCommands.execute(
      identity,
      workspaceId,
      teamId,
      async (tx, actorId) => {
        const target = await this.repository.workspaceMember(
          tx,
          workspaceId,
          dto.membershipId,
        );
        if (!target || target.state !== 'ACTIVE')
          throw new NotFoundException('Active membership not found.');
        if (target.role === 'GUEST' && dto.role === 'ADMIN')
          throw new ForbiddenException('Guests cannot administer teams.');
        if (await this.repository.member(tx, teamId, target.id))
          throw new ConflictException('Team membership already exists.');
        const result = await this.repository.addMember(tx, {
          id: randomUUID(),
          workspaceId,
          teamId,
          membershipId: target.id,
          role: dto.role,
        });
        await this.teamCommands.fact(
          tx,
          workspaceId,
          actorId,
          teamId,
          'team.member_added',
          { team_id: teamId, membership_id: target.id, role: dto.role },
        );
        return result;
      },
      201,
    );
  }
  changeMember(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    membershipId: string,
    role?: 'MEMBER' | 'ADMIN',
  ) {
    return this.teamCommands.execute(
      identity,
      workspaceId,
      teamId,
      async (tx, actorId) => {
        const existing = await this.repository.member(tx, teamId, membershipId);
        if (!existing)
          throw new NotFoundException('Team membership not found.');
        const target = await this.repository.workspaceMember(
          tx,
          workspaceId,
          membershipId,
        );
        if (
          role &&
          (target?.state !== 'ACTIVE' ||
            (target.role === 'GUEST' && role === 'ADMIN'))
        )
          throw new ForbiddenException(
            'Active non-guest membership required for team administration.',
          );
        const all = await this.repository.members(tx, teamId);
        if (
          existing.role === 'ADMIN' &&
          role !== 'ADMIN' &&
          !all.some(
            (x) => x.membershipId !== membershipId && x.role === 'ADMIN',
          )
        )
          throw new ConflictException('Team requires an active administrator.');
        const result = role
          ? await this.repository.updateMember(tx, teamId, membershipId, role)
          : (await this.repository.removeMember(tx, teamId, membershipId),
            { membershipId, removed: true });
        await this.teamCommands.fact(
          tx,
          workspaceId,
          actorId,
          teamId,
          role ? 'team.member_updated' : 'team.member_removed',
          {
            team_id: teamId,
            membership_id: membershipId,
            ...(role ? { role } : {}),
          },
        );
        return result;
      },
    );
  }
  settings(userId: string, workspaceId: string, teamId: string) {
    return this.get(userId, workspaceId, teamId).then((team) => ({
      timezone: team.timezone,
      cyclesEnabled: team.cyclesEnabled,
      cycleDurationWeeks: team.cycleDurationWeeks,
      cycleStartDay: team.cycleStartDay,
      cycleCooldownDays: team.cycleCooldownDays,
      upcomingCyclesCount: team.upcomingCyclesCount,
    }));
  }
  updateSettings(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    dto: TeamSettingsDto,
  ) {
    dto = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );
    if (!Object.keys(dto).length)
      throw new BadRequestException('At least one setting required.');
    return this.teamCommands.execute(
      identity,
      workspaceId,
      teamId,
      async (tx, actorId) => {
        const team = (await this.repository.team(tx, workspaceId, teamId))!;
        try {
          validateCycleSettings({ ...team, ...dto });
        } catch (error) {
          throw new BadRequestException(
            error instanceof Error ? error.message : 'Invalid cycle settings.',
          );
        }
        const result = await this.repository.update(tx, teamId, dto);
        await this.teamCommands.fact(
          tx,
          workspaceId,
          actorId,
          teamId,
          'team.settings_updated',
          {
            team_id: teamId,
            changed_fields: Object.keys(dto).map((key) =>
              key.replace(/[A-Z]/g, (letter) => '_' + letter.toLowerCase()),
            ),
          },
        );
        return result;
      },
    );
  }
}
