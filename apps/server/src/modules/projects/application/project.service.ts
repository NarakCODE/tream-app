import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../database/database.service';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { TeamAccessService } from '../../teams/application/team-access.service';
import { ProjectRepository } from '../infrastructure/project.repository';
import { ProjectAccessService } from './project-access.service';
import { ProjectCommandService } from './project-command.service';
import { ProjectStatusService } from './project-status.service';
import { validDateRange } from '../domain/project-policy';
import type {
  CreateProjectDto,
  UpdateProjectDto,
} from '../presentation/project.dto';
const date = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;
@Injectable()
export class ProjectService {
  constructor(
    private readonly db: DatabaseService,
    private readonly repository: ProjectRepository,
    private readonly access: ProjectAccessService,
    private readonly workspace: WorkspaceAuthorizationService,
    private readonly teams: TeamAccessService,
    private readonly commands: CommandBus,
    private readonly facts: ProjectCommandService,
    private readonly statuses: ProjectStatusService,
  ) {}
  list(userId: string, workspaceId: string, limit: number, cursor?: string) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.workspace.require(
        tx,
        userId,
        workspaceId,
        'workspace.read',
      );
      if (member.role === 'GUEST')
        throw new ForbiddenException('Project permission denied.');
      const { rows, total } = await this.repository.list(
        tx,
        workspaceId,
        member.id,
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
  get(userId: string, workspaceId: string, projectId: string) {
    return this.db.db.transaction(async (tx) => {
      const { project, links } = await this.access.require(
        tx,
        userId,
        workspaceId,
        projectId,
      );
      return { ...project, teamIds: links.map((x) => x.teamId) };
    });
  }
  async validMember(tx: Tx, workspaceId: string, id: string) {
    const member = await this.repository.workspaceMember(tx, workspaceId, id);
    if (!member) throw new NotFoundException('Project member not found.');
    if (member.state !== 'ACTIVE' || member.role === 'GUEST')
      throw new ConflictException(
        'Project members must be active non-guest workspace members.',
      );
    return member;
  }
  create(identity: Identity, workspaceId: string, dto: CreateProjectDto) {
    if (!validDateRange(date(dto.startDate), date(dto.targetDate)))
      throw new BadRequestException(
        'Target date must be on or after start date.',
      );
    const authorize = async (tx: Tx) => {
      const { member } = await this.workspace.require(
        tx,
        identity.userId,
        workspaceId,
        'workspace.read',
        { lock: true },
      );
      if (member.role === 'GUEST')
        throw new ForbiddenException('Project permission denied.');
      for (const teamId of [...dto.teamIds].sort())
        await this.teams.require(
          tx,
          identity.userId,
          workspaceId,
          teamId,
          'write',
          true,
        );
      return member;
    };
    return this.commands.execute(
      identity,
      async (tx) => {
        const member = await authorize(tx);
        const rows = await this.statuses.seed(tx, workspaceId);
        const status = dto.statusId
          ? rows.find((x) => x.id === dto.statusId)
          : rows.find((x) => x.isDefault);
        if (!status) throw new NotFoundException('Active status not found.');
        if (dto.leadId) await this.validMember(tx, workspaceId, dto.leadId);
        const now = new Date();
        const project = await this.repository.create(tx, {
          id: randomUUID(),
          workspaceId,
          name: dto.name.trim(),
          summary: dto.summary,
          description: dto.description,
          statusId: status.id,
          status: status.category,
          priority: dto.priority,
          leadId: dto.leadId,
          createdById: member.id,
          startDate: date(dto.startDate),
          targetDate: date(dto.targetDate),
          completedAt: status.category === 'COMPLETED' ? now : null,
        });
        for (const teamId of [...dto.teamIds].sort())
          await this.repository.addTeam(tx, {
            id: randomUUID(),
            workspaceId,
            projectId: project.id,
            teamId,
          });
        await this.repository.addMember(tx, {
          id: randomUUID(),
          workspaceId,
          projectId: project.id,
          membershipId: member.id,
        });
        await this.facts.fact(
          tx,
          workspaceId,
          member.id,
          project.id,
          'project.created',
          {
            project_id: project.id,
            status_id: status.id,
            team_ids: dto.teamIds,
          },
        );
        return { ...project, teamIds: dto.teamIds };
      },
      {
        statusCode: 201,
        authorize: async (tx) => {
          await authorize(tx);
        },
      },
    );
  }
  update(
    identity: Identity,
    workspaceId: string,
    projectId: string,
    dto: UpdateProjectDto,
  ) {
    if (!Object.keys(dto).length)
      throw new BadRequestException('At least one project change required.');
    return this.facts.execute(
      identity,
      workspaceId,
      projectId,
      async (tx, actorId) => {
        const project = (await this.repository.project(
          tx,
          workspaceId,
          projectId,
        ))!;
        if (
          !validDateRange(
            dto.startDate !== undefined
              ? date(dto.startDate)
              : project.startDate,
            dto.targetDate !== undefined
              ? date(dto.targetDate)
              : project.targetDate,
          )
        )
          throw new BadRequestException(
            'Target date must be on or after start date.',
          );
        if (dto.leadId) await this.validMember(tx, workspaceId, dto.leadId);
        const status = dto.statusId
          ? (await this.repository.statuses(tx, workspaceId)).find(
              (x) => x.id === dto.statusId,
            )
          : undefined;
        if (dto.statusId && !status)
          throw new NotFoundException('Active status not found.');
        if (status && ['COMPLETED', 'CANCELED'].includes(status.category))
          await this.requireFinished(tx, projectId);
        const result = await this.repository.update(tx, projectId, {
          ...dto,
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.startDate !== undefined
            ? { startDate: date(dto.startDate) }
            : { startDate: project.startDate }),
          ...(dto.targetDate !== undefined
            ? { targetDate: date(dto.targetDate) }
            : { targetDate: project.targetDate }),
          ...(status
            ? {
                status: status.category,
                completedAt:
                  status.category === 'COMPLETED'
                    ? (project.completedAt ?? new Date())
                    : null,
              }
            : {}),
        });
        const mapping: Record<string, string> = {
          statusId: 'status_id',
          leadId: 'lead_membership_id',
          startDate: 'starts_on',
          targetDate: 'target_on',
        };
        await this.facts.fact(
          tx,
          workspaceId,
          actorId,
          projectId,
          'project.updated',
          {
            project_id: projectId,
            changed_fields: Object.keys(dto).map((x) => mapping[x] ?? x),
          },
        );
        if (
          status &&
          status.category !== project.status &&
          ['COMPLETED', 'CANCELED'].includes(status.category)
        )
          await this.facts.fact(
            tx,
            workspaceId,
            actorId,
            projectId,
            status.category === 'COMPLETED'
              ? 'project.completed'
              : 'project.canceled',
            {
              project_id: projectId,
              status_id: status.id,
              [status.category === 'COMPLETED'
                ? 'completed_at'
                : 'canceled_at']:
                status.category === 'COMPLETED'
                  ? result.completedAt!.toISOString()
                  : new Date().toISOString(),
            },
          );
        return result;
      },
    );
  }
  async requireFinished(tx: Tx, projectId: string) {
    if ((await this.repository.progress(tx, projectId)).unfinished)
      throw new ConflictException(
        'Resolve unfinished issues before completing, canceling, archiving or deleting a project.',
      );
  }
  lifecycle(
    identity: Identity,
    workspaceId: string,
    projectId: string,
    action: 'archive' | 'delete' | 'restore',
  ) {
    return this.facts.execute(
      identity,
      workspaceId,
      projectId,
      async (tx, actorId) => {
        const project = (await this.repository.project(
          tx,
          workspaceId,
          projectId,
        ))!;
        const now = new Date();
        if (action === 'restore') {
          if (!project.archivedAt && !project.deletedAt)
            throw new ConflictException('Project is already active.');
          const links = await this.repository.links(tx, projectId);
          if (!links.length)
            throw new ConflictException(
              'Project requires at least one active team.',
            );
          for (const link of links)
            await this.teams.require(
              tx,
              identity.userId,
              workspaceId,
              link.teamId,
              'write',
              false,
            );
          if (
            !(await this.repository.statuses(tx, workspaceId)).some(
              (x) => x.id === project.statusId,
            )
          )
            throw new ConflictException('Project status is retired.');
          if (project.leadId)
            await this.validMember(tx, workspaceId, project.leadId);
          for (const item of await this.repository.members(tx, projectId))
            await this.validMember(tx, workspaceId, item.membershipId);
        } else {
          if (project.deletedAt)
            throw new ConflictException('Project is already deleted.');
          if (action === 'archive' && project.archivedAt)
            throw new ConflictException('Project is already archived.');
          await this.requireFinished(tx, projectId);
        }
        const value =
          action === 'restore'
            ? { archivedAt: null, deletedAt: null }
            : action === 'archive'
              ? { archivedAt: now, deletedAt: null }
              : { archivedAt: null, deletedAt: now };
        const result = await this.repository.update(tx, projectId, value);
        await this.facts.fact(
          tx,
          workspaceId,
          actorId,
          projectId,
          `project.${action === 'archive' ? 'archived' : action === 'delete' ? 'deleted' : 'restored'}`,
          {
            project_id: projectId,
            ...(action === 'restore'
              ? {}
              : {
                  [action === 'archive' ? 'archived_at' : 'deleted_at']:
                    now.toISOString(),
                }),
          },
        );
        return result;
      },
      action === 'delete' ? 200 : 201,
      true,
    );
  }
  teamsList(userId: string, workspaceId: string, projectId: string) {
    return this.db.db.transaction(async (tx) => {
      await this.access.require(tx, userId, workspaceId, projectId);
      return this.repository.links(tx, projectId);
    });
  }
  addTeam(
    identity: Identity,
    workspaceId: string,
    projectId: string,
    teamId: string,
  ) {
    return this.facts.execute(
      identity,
      workspaceId,
      projectId,
      async (tx, actorId) => {
        await this.teams.require(
          tx,
          identity.userId,
          workspaceId,
          teamId,
          'write',
          false,
        );
        const links = await this.repository.links(tx, projectId);
        if (links.some((x) => x.teamId === teamId))
          throw new ConflictException('Team is already linked.');
        if (links.length >= 100)
          throw new ConflictException('Team limit reached.');
        const result = await this.repository.addTeam(tx, {
          id: randomUUID(),
          workspaceId,
          projectId,
          teamId,
        });
        await this.facts.fact(
          tx,
          workspaceId,
          actorId,
          projectId,
          'project.team_added',
          { project_id: projectId, team_id: teamId },
        );
        return result;
      },
      201,
      false,
      [teamId],
    );
  }
  removeTeam(
    identity: Identity,
    workspaceId: string,
    projectId: string,
    teamId: string,
  ) {
    return this.facts.execute(
      identity,
      workspaceId,
      projectId,
      async (tx, actorId) => {
        const links = await this.repository.links(tx, projectId);
        if (!links.some((x) => x.teamId === teamId))
          throw new NotFoundException('Project team not found.');
        if (links.length === 1)
          throw new ConflictException('Project requires at least one team.');
        if (await this.repository.teamIssueUsage(tx, projectId, teamId))
          throw new ConflictException(
            'Reassign all team issues before unlinking.',
          );
        await this.repository.removeTeam(tx, projectId, teamId);
        await this.facts.fact(
          tx,
          workspaceId,
          actorId,
          projectId,
          'project.team_removed',
          { project_id: projectId, team_id: teamId },
        );
        return { teamId, removed: true };
      },
    );
  }
  members(userId: string, workspaceId: string, projectId: string) {
    return this.db.db.transaction(async (tx) => {
      await this.access.require(tx, userId, workspaceId, projectId);
      return this.repository.members(tx, projectId);
    });
  }
  addMember(
    identity: Identity,
    workspaceId: string,
    projectId: string,
    membershipId: string,
  ) {
    return this.facts.execute(
      identity,
      workspaceId,
      projectId,
      async (tx, actorId) => {
        await this.validMember(tx, workspaceId, membershipId);
        if (await this.repository.member(tx, projectId, membershipId))
          throw new ConflictException('Member is already linked.');
        const result = await this.repository.addMember(tx, {
          id: randomUUID(),
          workspaceId,
          projectId,
          membershipId,
        });
        await this.facts.fact(
          tx,
          workspaceId,
          actorId,
          projectId,
          'project.member_added',
          { project_id: projectId, membership_id: membershipId },
        );
        return result;
      },
      201,
    );
  }
  removeMember(
    identity: Identity,
    workspaceId: string,
    projectId: string,
    membershipId: string,
  ) {
    return this.facts.execute(
      identity,
      workspaceId,
      projectId,
      async (tx, actorId) => {
        if (!(await this.repository.member(tx, projectId, membershipId)))
          throw new NotFoundException('Project member not found.');
        await this.repository.removeMember(tx, projectId, membershipId);
        await this.facts.fact(
          tx,
          workspaceId,
          actorId,
          projectId,
          'project.member_removed',
          { project_id: projectId, membership_id: membershipId },
        );
        return { membershipId, removed: true };
      },
    );
  }
  progress(userId: string, workspaceId: string, projectId: string) {
    return this.db.db.transaction(async (tx) => {
      await this.access.require(tx, userId, workspaceId, projectId);
      return this.repository.progress(tx, projectId);
    });
  }
}
