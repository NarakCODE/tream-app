import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import { ValidationException } from '../../../common/exceptions/validation.exception';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import type { IssueStatusCategory } from '../domain/issue';
import type { WorkPriority } from '../domain/project';
import {
  ISSUES_REPOSITORY,
  type IssuesRepository,
  type IssueWithDetails,
} from './ports/issues-repository.port';

export interface ListIssuesQuery {
  cursor?: string;
  limit: number;
  teamId?: string;
  projectId?: string;
  cycleId?: string;
  assigneeId?: string;
  priority?: WorkPriority;
  statusCategory?: IssueStatusCategory;
  statusId?: string;
}

export interface CreateIssueCommand {
  title: string;
  description?: string | null;
  statusId?: string;
  priority?: WorkPriority;
  assigneeId?: string | null;
  projectId?: string | null;
  cycleId?: string | null;
  dueDate?: string | null;
  estimate?: number | null;
}

export interface UpdateIssueCommand {
  title?: string;
  description?: string | null;
  statusId?: string;
  priority?: WorkPriority;
  assigneeId?: string | null;
  projectId?: string | null;
  cycleId?: string | null;
  dueDate?: string | null;
  estimate?: number | null;
}

@Injectable()
export class IssuesService {
  constructor(
    @Inject(ISSUES_REPOSITORY)
    private readonly repository: IssuesRepository,
  ) {}

  async list(
    workspaceId: string,
    query: ListIssuesQuery,
  ): Promise<CursorPaginatedResult<IssueWithDetails>> {
    const page = await this.repository.list({
      workspaceId,
      cursor: query.cursor === undefined ? null : decodeCursor(query.cursor),
      limit: query.limit,
      teamId: query.teamId,
      projectId: query.projectId,
      cycleId: query.cycleId,
      assigneeId: query.assigneeId,
      priority: query.priority,
      statusCategory: query.statusCategory,
      statusId: query.statusId,
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

  async findById(issueId: string): Promise<IssueWithDetails> {
    const issue = await this.repository.findById(issueId);
    if (!issue) {
      throw this.forbidden();
    }
    return issue;
  }

  async create(
    workspaceId: string,
    teamId: string,
    actorUserId: string,
    input: CreateIssueCommand,
  ): Promise<IssueWithDetails> {
    const dueDate = this.toDate(input.dueDate, 'dueDate');

    const result = await this.repository.create({
      workspaceId,
      teamId,
      actorUserId,
      title: input.title.trim(),
      description: input.description,
      statusId: input.statusId,
      priority: input.priority ?? 'NO_PRIORITY',
      assigneeId: input.assigneeId ?? null,
      projectId: input.projectId ?? null,
      cycleId: input.cycleId ?? null,
      dueDate,
      estimate: input.estimate ?? null,
    });

    if (result.type === 'created') {
      return result.issue;
    }
    if (result.type === 'project_not_linked_to_team') {
      throw new ValidationException([
        { field: 'projectId', constraints: [result.message] },
      ]);
    }
    if (result.type === 'cycle_not_in_team') {
      throw new ValidationException([
        { field: 'cycleId', constraints: [result.message] },
      ]);
    }
    if (result.type === 'status_not_in_team') {
      throw new ValidationException([
        { field: 'statusId', constraints: [result.message] },
      ]);
    }
    if (result.type === 'reference_not_found') {
      throw new ResourceNotFoundException(result.reference, 'specified id');
    }
    if (result.type === 'team_retired') {
      throw new AppException(
        AppErrorCode.Forbidden,
        'Cannot create issues in a retired team.',
        HttpStatus.FORBIDDEN,
      );
    }
    throw this.forbidden();
  }

  async update(
    issueId: string,
    actorUserId: string,
    input: UpdateIssueCommand,
  ): Promise<IssueWithDetails> {
    const dueDate = this.toDate(input.dueDate, 'dueDate');

    const result = await this.repository.update({
      issueId,
      actorUserId,
      changes: {
        ...(input.title === undefined ? {} : { title: input.title.trim() }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.statusId === undefined ? {} : { statusId: input.statusId }),
        ...(input.priority === undefined ? {} : { priority: input.priority }),
        ...(input.assigneeId === undefined
          ? {}
          : { assigneeId: input.assigneeId }),
        ...(input.projectId === undefined
          ? {}
          : { projectId: input.projectId }),
        ...(input.cycleId === undefined ? {} : { cycleId: input.cycleId }),
        ...(input.dueDate === undefined ? {} : { dueDate }),
        ...(input.estimate === undefined ? {} : { estimate: input.estimate }),
      },
      updatedAt: new Date(),
    });

    if (result.type === 'updated' || result.type === 'unchanged') {
      return result.issue;
    }
    if (result.type === 'project_not_linked_to_team') {
      throw new ValidationException([
        { field: 'projectId', constraints: [result.message] },
      ]);
    }
    if (result.type === 'cycle_not_in_team') {
      throw new ValidationException([
        { field: 'cycleId', constraints: [result.message] },
      ]);
    }
    if (result.type === 'status_not_in_team') {
      throw new ValidationException([
        { field: 'statusId', constraints: [result.message] },
      ]);
    }
    if (result.type === 'reference_not_found') {
      throw new ResourceNotFoundException(result.reference, 'specified id');
    }
    if (result.type === 'team_retired') {
      throw new AppException(
        AppErrorCode.Forbidden,
        'Cannot update issues in a retired team.',
        HttpStatus.FORBIDDEN,
      );
    }
    throw this.forbidden();
  }

  async delete(issueId: string, actorUserId: string): Promise<void> {
    const result = await this.repository.delete({
      issueId,
      actorUserId,
      deletedAt: new Date(),
    });
    if (result.type !== 'deleted') {
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
      'You do not have access to this issue resource.',
      HttpStatus.FORBIDDEN,
    );
  }
}
