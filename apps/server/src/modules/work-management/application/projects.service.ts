import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import { ResourceConflictException } from '../../../common/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import { ValidationException } from '../../../common/exceptions/validation.exception';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import type {
  ProjectStatus,
  ProjectTeam,
  WorkPriority,
} from '../domain/project';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
  type ProjectWithDetails,
} from './ports/projects-repository.port';

export interface ListProjectsQuery {
  cursor?: string;
  limit: number;
  status?: ProjectStatus;
  teamId?: string;
  leadId?: string;
}

export interface CreateProjectCommand {
  name: string;
  summary?: string | null;
  description?: string | null;
  status?: ProjectStatus;
  priority?: WorkPriority;
  leadId?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
  teamIds?: string[];
}

export interface UpdateProjectCommand {
  name?: string;
  summary?: string | null;
  description?: string | null;
  status?: ProjectStatus;
  priority?: WorkPriority;
  leadId?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
}

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PROJECTS_REPOSITORY)
    private readonly repository: ProjectsRepository,
  ) {}

  async list(
    workspaceId: string,
    query: ListProjectsQuery,
  ): Promise<CursorPaginatedResult<ProjectWithDetails>> {
    const page = await this.repository.list({
      workspaceId,
      cursor: query.cursor === undefined ? null : decodeCursor(query.cursor),
      limit: query.limit,
      status: query.status,
      teamId: query.teamId,
      leadId: query.leadId,
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

  async findById(projectId: string): Promise<ProjectWithDetails> {
    const project = await this.repository.findById(projectId);
    if (!project) {
      throw this.forbidden();
    }
    return project;
  }

  async create(
    workspaceId: string,
    actorUserId: string,
    input: CreateProjectCommand,
  ): Promise<ProjectWithDetails> {
    const startDate = this.toDate(input.startDate, 'startDate');
    const targetDate = this.toDate(input.targetDate, 'targetDate');

    if (startDate && targetDate && targetDate < startDate) {
      throw new ValidationException([
        {
          field: 'targetDate',
          constraints: ['targetDate cannot be earlier than startDate'],
        },
      ]);
    }

    const result = await this.repository.create({
      workspaceId,
      actorUserId,
      name: input.name.trim(),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      status: input.status ?? 'PLANNED',
      priority: input.priority ?? 'NO_PRIORITY',
      leadId: input.leadId ?? null,
      ...(startDate !== undefined ? { startDate } : {}),
      ...(targetDate !== undefined ? { targetDate } : {}),
      ...(input.teamIds !== undefined ? { teamIds: input.teamIds } : {}),
    });

    if (result.type === 'created') {
      return result.project;
    }
    if (result.type === 'invalid_dates') {
      throw new ValidationException([
        {
          field: 'targetDate',
          constraints: [result.message],
        },
      ]);
    }
    if (result.type === 'reference_not_found') {
      throw new ResourceNotFoundException(result.reference, 'specified id');
    }
    throw this.forbidden();
  }

  async update(
    projectId: string,
    actorUserId: string,
    input: UpdateProjectCommand,
  ): Promise<ProjectWithDetails> {
    const startDate = this.toDate(input.startDate, 'startDate');
    const targetDate = this.toDate(input.targetDate, 'targetDate');

    if (startDate && targetDate && targetDate < startDate) {
      throw new ValidationException([
        {
          field: 'targetDate',
          constraints: ['targetDate cannot be earlier than startDate'],
        },
      ]);
    }

    const result = await this.repository.update({
      projectId,
      actorUserId,
      changes: {
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.priority === undefined ? {} : { priority: input.priority }),
        ...(input.leadId === undefined ? {} : { leadId: input.leadId }),
        ...(input.startDate === undefined ? {} : { startDate }),
        ...(input.targetDate === undefined ? {} : { targetDate }),
      },
      updatedAt: new Date(),
    });

    if (result.type === 'updated' || result.type === 'unchanged') {
      return result.project;
    }
    if (result.type === 'invalid_dates') {
      throw new ValidationException([
        {
          field: 'targetDate',
          constraints: [result.message],
        },
      ]);
    }
    if (result.type === 'reference_not_found') {
      throw new ResourceNotFoundException(result.reference, 'specified id');
    }
    throw this.forbidden();
  }

  async delete(projectId: string, actorUserId: string): Promise<void> {
    const result = await this.repository.delete({
      projectId,
      actorUserId,
      deletedAt: new Date(),
    });
    if (result.type !== 'deleted') {
      throw this.forbidden();
    }
  }

  async addTeam(
    projectId: string,
    actorUserId: string,
    teamId: string,
  ): Promise<ProjectTeam> {
    const result = await this.repository.addTeam({
      projectId,
      actorUserId,
      teamId,
    });
    if (result.type === 'added') {
      return result.association;
    }
    if (result.type === 'conflict') {
      throw new ResourceConflictException(result.message);
    }
    if (result.type === 'reference_not_found') {
      throw new ResourceNotFoundException(result.reference, teamId);
    }
    throw this.forbidden();
  }

  async removeTeam(
    projectId: string,
    actorUserId: string,
    teamId: string,
  ): Promise<void> {
    const result = await this.repository.removeTeam({
      projectId,
      actorUserId,
      teamId,
    });
    if (result.type !== 'removed') {
      throw this.forbidden();
    }
  }

  private toDate(
    value: string | null | undefined,
    field: string,
  ): Date | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new ValidationException([
        {
          field,
          constraints: [`${field} must be a valid ISO 8601 date string`],
        },
      ]);
    }
    return date;
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this project resource.',
      HttpStatus.FORBIDDEN,
    );
  }
}
