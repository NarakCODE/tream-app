import type {
  AssignTaskInput,
  AssignTaskResult,
  CreateTaskInput,
  CreateTaskResult,
  DeleteTaskInput,
  DeleteTaskResult,
  ListTasksInput,
  TaskAccess,
  TaskPage,
  TaskReference,
  TasksRepository,
  TransitionTaskStatusInput,
  TransitionTaskStatusResult,
  UpdateTaskInput,
  UpdateTaskResult,
} from '../../src/modules/tasks/application/ports/tasks-repository.port';
import type { Task } from '../../src/modules/tasks/domain/task';
import { canWriteTasks } from '../../src/modules/tasks/domain/task-role-policy';
import {
  canPatchTaskStatus,
  statusAfterCompletion,
  statusAfterReopen,
} from '../../src/modules/tasks/domain/task-status-policy';
import type { InMemoryWorkspaceRepository } from './in-memory-workspace.repository';

export class InMemoryTasksRepository implements TasksRepository {
  private readonly tasks = new Map<string, Task>();
  private contactValidator?: (
    workspaceId: string,
    contactId: string,
  ) => boolean;
  private dealValidator?: (workspaceId: string, dealId: string) => boolean;

  constructor(
    private readonly workspaceRepository: InMemoryWorkspaceRepository,
  ) {}

  reset(): void {
    this.tasks.clear();
  }

  setContactValidator(
    validator: (workspaceId: string, contactId: string) => boolean,
  ): void {
    this.contactValidator = validator;
  }

  setDealValidator(
    validator: (workspaceId: string, dealId: string) => boolean,
  ): void {
    this.dealValidator = validator;
  }

  list(input: ListTasksInput): Promise<TaskPage> {
    const all = [...this.tasks.values()]
      .filter(
        (task) =>
          task.workspaceId === input.workspaceId &&
          task.deletedAt === null &&
          (input.status === undefined || task.status === input.status) &&
          (input.assigneeId === undefined ||
            task.assigneeId === input.assigneeId),
      )
      .sort((left, right) => {
        const byCreatedAt =
          right.createdAt.getTime() - left.createdAt.getTime();
        return byCreatedAt !== 0
          ? byCreatedAt
          : right.id.localeCompare(left.id);
      });
    const afterCursor =
      input.cursor === null
        ? all
        : all.filter(
            (task) =>
              task.createdAt < input.cursor!.createdAt ||
              (task.createdAt.getTime() === input.cursor!.createdAt.getTime() &&
                task.id < input.cursor!.id),
          );
    return Promise.resolve({
      items: afterCursor.slice(0, input.limit),
      hasNext: afterCursor.length > input.limit,
      total: all.length,
    });
  }

  async findAccess(taskId: string, userId: string): Promise<TaskAccess | null> {
    const task = this.tasks.get(taskId);
    if (task === undefined || task.deletedAt !== null) {
      return null;
    }
    const access = await this.workspaceRepository.findActiveWorkspaceMembership(
      task.workspaceId,
      userId,
    );
    return access === null ? null : { task, role: access.membership.role };
  }

  async create(input: CreateTaskInput): Promise<CreateTaskResult> {
    const access = await this.workspaceRepository.findActiveWorkspaceMembership(
      input.task.workspaceId,
      input.actorUserId,
    );
    if (access === null) {
      return { type: 'workspace_not_found' };
    }
    if (!canWriteTasks(access.membership.role)) {
      return { type: 'forbidden' };
    }
    const invalid = await this.invalidReference(input.task.workspaceId, {
      contactId: input.task.contactId,
      dealId: input.task.dealId,
      assigneeId: input.task.assigneeId,
    });
    if (invalid !== null) {
      return { type: 'reference_not_found', reference: invalid };
    }
    this.tasks.set(input.task.id, input.task);
    return { type: 'created', task: input.task };
  }

  async update(input: UpdateTaskInput): Promise<UpdateTaskResult> {
    const access = await this.findAccess(input.taskId, input.actorUserId);
    if (access === null) {
      return { type: 'not_found' };
    }
    if (!canWriteTasks(access.role)) {
      return { type: 'forbidden' };
    }
    if (
      input.changes.status !== undefined &&
      !canPatchTaskStatus(access.task.status, input.changes.status)
    ) {
      return { type: 'invalid_status_transition' };
    }
    const invalid = await this.invalidReference(access.task.workspaceId, {
      ...(input.changes.contactId === undefined
        ? {}
        : { contactId: input.changes.contactId }),
      ...(input.changes.dealId === undefined
        ? {}
        : { dealId: input.changes.dealId }),
    });
    if (invalid !== null) {
      return { type: 'reference_not_found', reference: invalid };
    }
    if (!this.hasChanges(access.task, input.changes)) {
      return { type: 'unchanged', task: access.task };
    }
    const updated: Task = {
      ...access.task,
      ...input.changes,
      updatedAt: input.updatedAt,
    };
    this.tasks.set(updated.id, updated);
    return { type: 'updated', task: updated };
  }

  async assign(input: AssignTaskInput): Promise<AssignTaskResult> {
    const access = await this.findAccess(input.taskId, input.actorUserId);
    if (access === null) {
      return { type: 'not_found' };
    }
    if (!canWriteTasks(access.role)) {
      return { type: 'forbidden' };
    }
    const invalid = await this.invalidReference(access.task.workspaceId, {
      assigneeId: input.memberId,
    });
    if (invalid !== null) {
      return { type: 'reference_not_found', reference: invalid };
    }
    if (access.task.assigneeId === input.memberId) {
      return { type: 'unchanged', task: access.task };
    }
    const updated = {
      ...access.task,
      assigneeId: input.memberId,
      updatedAt: input.updatedAt,
    };
    this.tasks.set(updated.id, updated);
    return { type: 'assigned', task: updated };
  }

  async transitionStatus(
    input: TransitionTaskStatusInput,
  ): Promise<TransitionTaskStatusResult> {
    const access = await this.findAccess(input.taskId, input.actorUserId);
    if (access === null) {
      return { type: 'not_found' };
    }
    if (!canWriteTasks(access.role)) {
      return { type: 'forbidden' };
    }
    const next =
      input.action === 'complete'
        ? statusAfterCompletion(access.task.status)
        : statusAfterReopen(access.task.status);
    if (next === access.task.status) {
      return { type: 'unchanged', task: access.task };
    }
    const updated = {
      ...access.task,
      status: next,
      updatedAt: input.updatedAt,
    };
    this.tasks.set(updated.id, updated);
    return { type: 'updated', task: updated };
  }

  async softDelete(input: DeleteTaskInput): Promise<DeleteTaskResult> {
    const access = await this.findAccess(input.taskId, input.actorUserId);
    if (access === null) {
      return { type: 'not_found' };
    }
    if (!canWriteTasks(access.role)) {
      return { type: 'forbidden' };
    }
    this.tasks.set(input.taskId, {
      ...access.task,
      deletedAt: input.deletedAt,
      updatedAt: input.deletedAt,
    });
    return { type: 'deleted' };
  }

  private hasChanges(task: Task, changes: UpdateTaskInput['changes']): boolean {
    return Object.entries(changes).some(([key, value]) => {
      const current = task[key as keyof Task];
      return current instanceof Date && value instanceof Date
        ? current.getTime() !== value.getTime()
        : current !== value;
    });
  }

  private async invalidReference(
    workspaceId: string,
    refs: {
      contactId?: string | null;
      dealId?: string | null;
      assigneeId?: string | null;
    },
  ): Promise<TaskReference | null> {
    if (
      refs.contactId !== undefined &&
      refs.contactId !== null &&
      !(this.contactValidator?.(workspaceId, refs.contactId) ?? false)
    ) {
      return { resource: 'Contact', identifier: refs.contactId };
    }
    if (
      refs.dealId !== undefined &&
      refs.dealId !== null &&
      !(this.dealValidator?.(workspaceId, refs.dealId) ?? false)
    ) {
      return { resource: 'Deal', identifier: refs.dealId };
    }
    if (
      refs.assigneeId !== undefined &&
      refs.assigneeId !== null &&
      (await this.workspaceRepository.findWorkspaceMember(
        workspaceId,
        refs.assigneeId,
      )) === null
    ) {
      return { resource: 'Workspace member', identifier: refs.assigneeId };
    }
    return null;
  }
}
