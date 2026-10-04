import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../database/database.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import { ProjectRepository } from '../infrastructure/project.repository';
import { ProjectAccessService } from './project-access.service';
import { ProjectCommandService } from './project-command.service';
import type {
  CreateMilestoneDto,
  UpdateMilestoneDto,
  CreateProjectUpdateDto,
} from '../presentation/project.dto';
@Injectable()
export class ProjectCollaborationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly repository: ProjectRepository,
    private readonly access: ProjectAccessService,
    private readonly commands: ProjectCommandService,
  ) {}
  milestones(userId: string, workspaceId: string, projectId: string) {
    return this.db.db.transaction(async (tx) => {
      await this.access.require(tx, userId, workspaceId, projectId);
      return this.repository.milestones(tx, projectId);
    });
  }
  createMilestone(
    identity: Identity,
    workspaceId: string,
    projectId: string,
    dto: CreateMilestoneDto,
  ) {
    return this.commands.execute(
      identity,
      workspaceId,
      projectId,
      async (tx, actorId) => {
        const rows = await this.repository.milestones(tx, projectId);
        if (rows.length >= 1000)
          throw new ConflictException('Milestone limit reached.');
        const result = await this.repository.createMilestone(tx, {
          id: randomUUID(),
          workspaceId,
          projectId,
          name: dto.name.trim(),
          description: dto.description,
          targetDate: dto.targetDate,
          position: rows.length,
        });
        await this.commands.fact(
          tx,
          workspaceId,
          actorId,
          projectId,
          'project.milestone_created',
          { project_id: projectId, milestone_id: result.id },
        );
        return result;
      },
      201,
    );
  }
  updateMilestone(
    identity: Identity,
    workspaceId: string,
    projectId: string,
    id: string,
    dto: UpdateMilestoneDto,
  ) {
    if (!Object.keys(dto).length)
      throw new BadRequestException('At least one milestone change required.');
    return this.commands.execute(
      identity,
      workspaceId,
      projectId,
      async (tx, actorId) => {
        if (
          !(await this.repository.milestones(tx, projectId)).some(
            (x) => x.id === id,
          )
        )
          throw new NotFoundException('Milestone not found.');
        const result = await this.repository.updateMilestone(tx, id, {
          ...dto,
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        });
        await this.commands.fact(
          tx,
          workspaceId,
          actorId,
          projectId,
          'project.milestone_updated',
          { project_id: projectId, milestone_id: id },
        );
        return result;
      },
    );
  }
  reorderMilestones(
    identity: Identity,
    workspaceId: string,
    projectId: string,
    ids: string[],
  ) {
    return this.commands.execute(
      identity,
      workspaceId,
      projectId,
      async (tx, actorId) => {
        const rows = await this.repository.milestones(tx, projectId);
        if (
          rows.length !== ids.length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !rows.some((x) => x.id === id))
        )
          throw new BadRequestException(
            'Provide every milestone exactly once.',
          );
        await this.repository.reorderMilestones(tx, projectId, ids);
        await this.commands.fact(
          tx,
          workspaceId,
          actorId,
          projectId,
          'project.milestones_reordered',
          { project_id: projectId, milestone_ids: ids },
        );
        return this.repository.milestones(tx, projectId);
      },
      201,
    );
  }
  deleteMilestone(
    identity: Identity,
    workspaceId: string,
    projectId: string,
    id: string,
  ) {
    return this.commands.execute(
      identity,
      workspaceId,
      projectId,
      async (tx, actorId) => {
        const rows = await this.repository.milestones(tx, projectId);
        if (!rows.some((x) => x.id === id))
          throw new NotFoundException('Milestone not found.');
        if (await this.repository.milestoneUsage(tx, id))
          throw new ConflictException(
            'Reassign all issues before deleting this milestone.',
          );
        await this.repository.deleteMilestone(tx, id);
        await this.repository.reorderMilestones(
          tx,
          projectId,
          rows.filter((x) => x.id !== id).map((x) => x.id),
        );
        await this.commands.fact(
          tx,
          workspaceId,
          actorId,
          projectId,
          'project.milestone_deleted',
          { project_id: projectId, milestone_id: id },
        );
        return { milestoneId: id, deleted: true };
      },
    );
  }
  updates(
    userId: string,
    workspaceId: string,
    projectId: string,
    limit: number,
    cursor?: string,
  ) {
    return this.db.db.transaction(async (tx) => {
      await this.access.require(tx, userId, workspaceId, projectId);
      const { rows, total } = await this.repository.updates(
        tx,
        projectId,
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
  publish(
    identity: Identity,
    workspaceId: string,
    projectId: string,
    dto: CreateProjectUpdateDto,
  ) {
    return this.commands.execute(
      identity,
      workspaceId,
      projectId,
      async (tx, actorId) => {
        const result = await this.repository.publish(tx, {
          id: randomUUID(),
          workspaceId,
          projectId,
          authorId: actorId,
          body: dto.body.trim(),
          health: dto.health,
        });
        await this.commands.fact(
          tx,
          workspaceId,
          actorId,
          projectId,
          'project.update_published',
          {
            project_id: projectId,
            update_id: result.id,
            health: result.health,
          },
        );
        return result;
      },
      201,
    );
  }
}
