import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../database/database.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import { TeamRepository } from '../infrastructure/team.repository';
import { TeamAccessService } from './team-access.service';
import { TeamCommandService } from './team-command.service';
import { TERMINAL_CATEGORIES } from '../domain/team-policy';
import type {
  CreateStatusDto,
  UpdateStatusDto,
} from '../presentation/team.dto';
@Injectable()
export class TeamStatusService {
  constructor(
    private readonly db: DatabaseService,
    private readonly repository: TeamRepository,
    private readonly access: TeamAccessService,
    private readonly commands: TeamCommandService,
  ) {}
  list(userId: string, workspaceId: string, teamId: string) {
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
      return this.repository.statuses(tx, teamId);
    });
  }
  create(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    dto: CreateStatusDto,
  ) {
    return this.commands.execute(
      identity,
      workspaceId,
      teamId,
      async (tx, actorId) => {
        const statuses = await this.repository.statuses(tx, teamId);
        if (statuses.length >= 1000)
          throw new ConflictException('Status catalog limit reached.');
        const position = dto.position ?? statuses.length;
        if (position > statuses.length)
          throw new BadRequestException('Position exceeds catalog size.');
        const status = await this.repository.createStatus(tx, {
          id: randomUUID(),
          teamId,
          name: dto.name.trim(),
          category: dto.category,
          position: statuses.length,
        });
        const ids = statuses.map((x) => x.id);
        ids.splice(position, 0, status.id);
        await this.repository.reorder(tx, teamId, ids);
        await this.commands.fact(
          tx,
          workspaceId,
          actorId,
          teamId,
          'issue_status.created',
          { team_id: teamId, status_id: status.id },
        );
        return { ...status, position };
      },
      201,
    );
  }
  update(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    id: string,
    dto: UpdateStatusDto,
  ) {
    if (!Object.keys(dto).length)
      throw new BadRequestException('At least one status change required.');
    return this.commands.execute(
      identity,
      workspaceId,
      teamId,
      async (tx, actorId) => {
        const target = (await this.repository.statuses(tx, teamId)).find(
          (x) => x.id === id,
        );
        if (!target) throw new NotFoundException('Status not found.');
        if (dto.category !== undefined && dto.category !== target.category) {
          if (await this.repository.statusUsage(tx, id))
            throw new ConflictException('In-use status category is immutable.');
          if (
            target.isDefault &&
            !['BACKLOG', 'UNSTARTED'].includes(dto.category)
          )
            throw new ConflictException(
              'Default must be backlog or unstarted.',
            );
        }
        const result = await this.repository.updateStatus(tx, id, {
          ...dto,
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        });
        await this.commands.fact(
          tx,
          workspaceId,
          actorId,
          teamId,
          'issue_status.updated',
          { team_id: teamId, status_id: id },
        );
        return result;
      },
    );
  }
  reorder(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    ids: string[],
  ) {
    return this.commands.execute(
      identity,
      workspaceId,
      teamId,
      async (tx, actorId) => {
        const rows = await this.repository.statuses(tx, teamId);
        if (
          rows.length !== ids.length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !rows.some((x) => x.id === id))
        )
          throw new BadRequestException(
            'Provide every active status exactly once.',
          );
        await this.repository.reorder(tx, teamId, ids);
        await this.commands.fact(
          tx,
          workspaceId,
          actorId,
          teamId,
          'issue_status.reordered',
          { team_id: teamId, status_ids: ids },
        );
        return this.repository.statuses(tx, teamId);
      },
      201,
    );
  }
  setDefault(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    id: string,
  ) {
    return this.commands.execute(
      identity,
      workspaceId,
      teamId,
      async (tx, actorId) => {
        const rows = await this.repository.statuses(tx, teamId);
        const target = rows.find((x) => x.id === id);
        if (!target) throw new NotFoundException('Status not found.');
        if (!['BACKLOG', 'UNSTARTED'].includes(target.category))
          throw new ConflictException('Default must be backlog or unstarted.');
        for (const row of rows.filter((x) => x.isDefault && x.id !== id))
          await this.repository.updateStatus(tx, row.id, { isDefault: false });
        const result = await this.repository.updateStatus(tx, id, {
          isDefault: true,
        });
        await this.commands.fact(
          tx,
          workspaceId,
          actorId,
          teamId,
          'issue_status.default_changed',
          { team_id: teamId, status_id: id },
        );
        return result;
      },
      201,
    );
  }
  retire(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    id: string,
    replacementId?: string,
  ) {
    return this.commands.execute(
      identity,
      workspaceId,
      teamId,
      async (tx, actorId) => {
        const rows = await this.repository.statuses(tx, teamId);
        const target = rows.find((x) => x.id === id);
        if (!target) throw new NotFoundException('Status not found.');
        const replacement = replacementId
          ? rows.find((x) => x.id === replacementId && x.id !== id)
          : undefined;
        if (replacementId && !replacement)
          throw new NotFoundException('Replacement status not found.');
        if (
          (target.isDefault || (await this.repository.statusUsage(tx, id))) &&
          !replacement
        )
          throw new ConflictException('An explicit replacement is required.');
        if (
          (target.isDefault &&
            replacement &&
            TERMINAL_CATEGORIES.includes(replacement.category)) ||
          (target.isDefault && replacement?.category === 'STARTED')
        )
          throw new ConflictException(
            'Default replacement must be backlog or unstarted.',
          );
        if (replacement) {
          const affected = await this.repository.replaceStatus(
            tx,
            id,
            replacement.id,
          );
          for (const issue of affected)
            await this.commands.fact(
              tx,
              workspaceId,
              actorId,
              teamId,
              'issue.status_changed',
              {
                issue_id: issue.id,
                previous_status_id: id,
                status_id: replacement.id,
              },
              'issue',
              issue.id,
            );
        }
        const result = await this.repository.updateStatus(tx, id, {
          isDefault: false,
          retiredAt: new Date(),
        });
        if (target.isDefault && replacement)
          await this.repository.updateStatus(tx, replacement.id, {
            isDefault: true,
          });
        await this.repository.reorder(
          tx,
          teamId,
          rows.filter((x) => x.id !== id).map((x) => x.id),
        );
        await this.commands.fact(
          tx,
          workspaceId,
          actorId,
          teamId,
          'issue_status.retired',
          {
            team_id: teamId,
            status_id: id,
            replacement_status_id: replacementId ?? null,
          },
        );
        return result;
      },
    );
  }
}
