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
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { ProjectRepository } from '../infrastructure/project.repository';
import { ProjectCommandService } from './project-command.service';
import { ProjectAccessService } from './project-access.service';
import type {
  CreateProjectStatusDto,
  UpdateProjectStatusDto,
} from '../presentation/project.dto';
@Injectable()
export class ProjectStatusService {
  constructor(
    private readonly db: DatabaseService,
    private readonly repository: ProjectRepository,
    private readonly workspace: WorkspaceAuthorizationService,
    private readonly commands: CommandBus,
    private readonly facts: ProjectCommandService,
    private readonly access: ProjectAccessService,
  ) {}
  async seed(tx: Tx, workspaceId: string) {
    const rows = await this.repository.statuses(tx, workspaceId);
    if (!rows.some((row) => row.isDefault && row.category === 'PLANNED'))
      throw new ConflictException('Project status catalog is unavailable.');
    return rows;
  }

  private async authorize(
    tx: Tx,
    userId: string,
    workspaceId: string,
    manage = false,
  ) {
    const { member } = await this.workspace.require(
      tx,
      userId,
      workspaceId,
      'workspace.read',
      { lock: true },
    );
    if (
      member.role === 'GUEST' ||
      (manage && !['OWNER', 'ADMIN'].includes(member.role))
    )
      throw new ForbiddenException('Project status permission denied.');
    return member;
  }
  private execute<T>(
    identity: Identity,
    workspaceId: string,
    handler: (tx: Tx, actorId: string) => Promise<T>,
    statusCode = 200,
  ) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const member = await this.authorize(
          tx,
          identity.userId,
          workspaceId,
          true,
        );
        await this.seed(tx, workspaceId);
        return handler(tx, member.id);
      },
      {
        statusCode,
        authorize: async (tx) => {
          await this.authorize(tx, identity.userId, workspaceId, true);
        },
      },
    );
  }
  list(userId: string, workspaceId: string) {
    return this.db.db.transaction(async (tx) => {
      await this.authorize(tx, userId, workspaceId);
      return this.seed(tx, workspaceId);
    });
  }
  create(identity: Identity, workspaceId: string, dto: CreateProjectStatusDto) {
    return this.execute(
      identity,
      workspaceId,
      async (tx, actorId) => {
        const rows = await this.repository.statuses(tx, workspaceId);
        if (rows.length >= 1000)
          throw new ConflictException('Status catalog limit reached.');
        const result = await this.repository.createStatus(tx, {
          id: randomUUID(),
          workspaceId,
          name: dto.name.trim(),
          category: dto.category,
          color: dto.color,
          position: rows.length,
        });
        await this.facts.fact(
          tx,
          workspaceId,
          actorId,
          workspaceId,
          'project_status.created',
          { status_id: result.id },
          'workspace',
        );
        return result;
      },
      201,
    );
  }
  update(
    identity: Identity,
    workspaceId: string,
    id: string,
    dto: UpdateProjectStatusDto,
  ) {
    if (!Object.keys(dto).length)
      throw new BadRequestException('At least one status change required.');
    return this.execute(identity, workspaceId, async (tx, actorId) => {
      const row = (await this.repository.statuses(tx, workspaceId)).find(
        (x) => x.id === id,
      );
      if (!row) throw new NotFoundException('Status not found.');
      if (dto.category && dto.category !== row.category) {
        if ((await this.repository.statusUsage(tx, id)).length)
          throw new ConflictException('In-use status category is immutable.');
        if (row.isDefault && dto.category !== 'PLANNED')
          throw new ConflictException('Default must be planned.');
      }
      const result = await this.repository.updateStatus(tx, id, {
        ...dto,
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      });
      await this.facts.fact(
        tx,
        workspaceId,
        actorId,
        workspaceId,
        'project_status.updated',
        { status_id: id },
        'workspace',
      );
      return result;
    });
  }
  reorder(identity: Identity, workspaceId: string, ids: string[]) {
    return this.execute(
      identity,
      workspaceId,
      async (tx, actorId) => {
        const rows = await this.repository.statuses(tx, workspaceId);
        if (
          rows.length !== ids.length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !rows.some((x) => x.id === id))
        )
          throw new BadRequestException(
            'Provide every active status exactly once.',
          );
        await this.repository.reorderStatuses(tx, workspaceId, ids);
        await this.facts.fact(
          tx,
          workspaceId,
          actorId,
          workspaceId,
          'project_status.reordered',
          { status_ids: ids },
          'workspace',
        );
        return this.repository.statuses(tx, workspaceId);
      },
      201,
    );
  }
  setDefault(identity: Identity, workspaceId: string, id: string) {
    return this.execute(
      identity,
      workspaceId,
      async (tx, actorId) => {
        const rows = await this.repository.statuses(tx, workspaceId);
        const row = rows.find((x) => x.id === id);
        if (!row) throw new NotFoundException('Status not found.');
        if (row.category !== 'PLANNED')
          throw new ConflictException('Default must be planned.');
        for (const other of rows.filter((x) => x.isDefault && x.id !== id))
          await this.repository.updateStatus(tx, other.id, {
            isDefault: false,
          });
        const result = await this.repository.updateStatus(tx, id, {
          isDefault: true,
        });
        await this.facts.fact(
          tx,
          workspaceId,
          actorId,
          workspaceId,
          'project_status.default_changed',
          { status_id: id },
          'workspace',
        );
        return result;
      },
      201,
    );
  }
  retire(
    identity: Identity,
    workspaceId: string,
    id: string,
    replacementId?: string,
  ) {
    return this.execute(identity, workspaceId, async (tx, actorId) => {
      const rows = await this.repository.statuses(tx, workspaceId);
      const row = rows.find((x) => x.id === id);
      if (!row) throw new NotFoundException('Status not found.');
      const replacement = replacementId
        ? rows.find((x) => x.id === replacementId && x.id !== id)
        : undefined;
      if (replacementId && !replacement)
        throw new NotFoundException('Replacement status not found.');
      const used = await this.repository.statusUsage(tx, id);
      if ((row.isDefault || used.length) && !replacement)
        throw new ConflictException('An explicit replacement is required.');
      if (
        replacement &&
        ((used.length && replacement.category !== row.category) ||
          (row.isDefault && replacement.category !== 'PLANNED'))
      )
        throw new ConflictException(
          'Replacement must preserve the status category.',
        );
      for (const project of used) {
        await this.access.require(
          tx,
          identity.userId,
          workspaceId,
          project.id,
          'manage',
          true,
          true,
        );
        await this.repository.update(tx, project.id, {
          statusId: replacement!.id,
          status: replacement!.category,
        });
        await this.facts.fact(
          tx,
          workspaceId,
          actorId,
          project.id,
          'project.updated',
          { project_id: project.id, changed_fields: ['status_id'] },
        );
      }
      const result = await this.repository.updateStatus(tx, id, {
        archivedAt: new Date(),
        isDefault: false,
      });
      if (row.isDefault && replacement)
        await this.repository.updateStatus(tx, replacement.id, {
          isDefault: true,
        });
      await this.repository.reorderStatuses(
        tx,
        workspaceId,
        rows.filter((x) => x.id !== id).map((x) => x.id),
      );
      await this.facts.fact(
        tx,
        workspaceId,
        actorId,
        workspaceId,
        'project_status.retired',
        { status_id: id, replacement_status_id: replacementId ?? null },
        'workspace',
      );
      return result;
    });
  }
}
