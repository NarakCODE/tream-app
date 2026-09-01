import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import { ResourceConflictException } from '../../../common/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import { ValidationException } from '../../../common/exceptions/validation.exception';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import type { Task, TaskStatus } from '../domain/task';
import type { TaskPatchStatus } from '../domain/task-status-policy';
import {
  TASKS_REPOSITORY,
  type TaskChanges,
  type TaskReference,
  type TasksRepository,
} from './ports/tasks-repository.port';

export interface ListTasksQuery {
  cursor?: string;
  limit: number;
  status?: TaskStatus;
  assigneeId?: string;
}

export interface CreateTaskCommand {
  title: string;
  contactId?: string | null;
  dealId?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
}

export interface UpdateTaskCommand {
  title?: string;
  contactId?: string | null;
  dealId?: string | null;
  dueDate?: string | null;
  status?: TaskPatchStatus;
}

@Injectable()
export class TasksService {
  constructor(
    @Inject(TASKS_REPOSITORY)
    private readonly repository: TasksRepository,
  ) {}

  async list(
    workspaceId: string,
    query: ListTasksQuery,
  ): Promise<CursorPaginatedResult<Task>> {
    const page = await this.repository.list({
      workspaceId,
      cursor: query.cursor === undefined ? null : decodeCursor(query.cursor),
      limit: query.limit,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.assigneeId === undefined
        ? {}
        : { assigneeId: query.assigneeId }),
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

  async create(
    workspaceId: string,
    actorUserId: string,
    input: CreateTaskCommand,
  ): Promise<Task> {
    const now = new Date();
    const task: Task = {
      id: `tsk_${ulid()}`,
      workspaceId,
      contactId: input.contactId ?? null,
      dealId: input.dealId ?? null,
      assigneeId: input.assigneeId ?? null,
      title: input.title,
      status: 'TODO',
      dueDate: this.toDate(input.dueDate),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const result = await this.repository.create({ task, actorUserId });
    if (result.type === 'created') {
      return result.task;
    }
    if (result.type === 'reference_not_found') {
      throw this.referenceNotFound(result.reference);
    }
    throw this.forbidden();
  }

  async update(
    taskId: string,
    actorUserId: string,
    input: UpdateTaskCommand,
  ): Promise<Task> {
    const changes: TaskChanges = {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.contactId === undefined ? {} : { contactId: input.contactId }),
      ...(input.dealId === undefined ? {} : { dealId: input.dealId }),
      ...(input.dueDate === undefined
        ? {}
        : { dueDate: this.toDate(input.dueDate) }),
      ...(input.status === undefined ? {} : { status: input.status }),
    };
    const result = await this.repository.update({
      taskId,
      actorUserId,
      changes,
      updatedAt: new Date(),
    });
    if (result.type === 'updated' || result.type === 'unchanged') {
      return result.task;
    }
    if (result.type === 'reference_not_found') {
      throw this.referenceNotFound(result.reference);
    }
    if (result.type === 'invalid_status_transition') {
      throw new ResourceConflictException(
        'Completed tasks must be reopened before their status can be changed.',
        { action: 'Use the reopen task endpoint first.' },
      );
    }
    throw this.forbidden();
  }

  async assign(
    taskId: string,
    actorUserId: string,
    memberId: string,
  ): Promise<Task> {
    const result = await this.repository.assign({
      taskId,
      actorUserId,
      memberId,
      updatedAt: new Date(),
    });
    if (result.type === 'assigned' || result.type === 'unchanged') {
      return result.task;
    }
    if (result.type === 'reference_not_found') {
      throw this.referenceNotFound(result.reference);
    }
    throw this.forbidden();
  }

  async complete(taskId: string, actorUserId: string): Promise<Task> {
    return this.transitionStatus(taskId, actorUserId, 'complete');
  }

  async reopen(taskId: string, actorUserId: string): Promise<Task> {
    return this.transitionStatus(taskId, actorUserId, 'reopen');
  }

  async delete(taskId: string, actorUserId: string): Promise<void> {
    const result = await this.repository.softDelete({
      taskId,
      actorUserId,
      deletedAt: new Date(),
    });
    if (result.type !== 'deleted') {
      throw this.forbidden();
    }
  }

  private async transitionStatus(
    taskId: string,
    actorUserId: string,
    action: 'complete' | 'reopen',
  ): Promise<Task> {
    const result = await this.repository.transitionStatus({
      taskId,
      actorUserId,
      action,
      updatedAt: new Date(),
    });
    if (result.type === 'updated' || result.type === 'unchanged') {
      return result.task;
    }
    throw this.forbidden();
  }

  private toDate(value: string | null | undefined): Date | null {
    if (value === undefined || value === null) {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new ValidationException([
        {
          field: 'dueDate',
          constraints: ['dueDate must be a valid ISO 8601 date string'],
        },
      ]);
    }
    return date;
  }

  private referenceNotFound(
    reference: TaskReference,
  ): ResourceNotFoundException {
    return new ResourceNotFoundException(
      reference.resource,
      reference.identifier,
    );
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this task.',
      HttpStatus.FORBIDDEN,
    );
  }
}
