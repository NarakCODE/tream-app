import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import {
  contacts,
  deals,
  memberships,
  tasks,
  workspaces,
} from '../../../database/schema';
import type {
  AssignTaskInput,
  AssignTaskResult,
  CreateTaskInput,
  CreateTaskResult,
  DeleteTaskInput,
  DeleteTaskResult,
  ListTasksInput,
  TaskAccess,
  TaskChanges,
  TaskPage,
  TasksRepository,
  TransitionTaskStatusInput,
  TransitionTaskStatusResult,
  UpdateTaskInput,
  UpdateTaskResult,
} from '../application/ports/tasks-repository.port';
import type { Task } from '../domain/task';
import { canWriteTasks } from '../domain/task-role-policy';
import {
  canPatchTaskStatus,
  statusAfterCompletion,
  statusAfterReopen,
} from '../domain/task-status-policy';

const first = <T>(values: T[]): T | null => values[0] ?? null;

const activeWorkspaceFilter = (workspaceId: string) =>
  and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt));

const activeTaskFilter = (taskId: string) =>
  and(eq(tasks.id, taskId), isNull(tasks.deletedAt));

@Injectable()
export class DrizzleTasksRepository implements TasksRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(input: ListTasksInput): Promise<TaskPage> {
    const cursorFilter =
      input.cursor === null
        ? undefined
        : or(
            lt(tasks.createdAt, input.cursor.createdAt),
            and(
              eq(tasks.createdAt, input.cursor.createdAt),
              lt(tasks.id, input.cursor.id),
            ),
          );
    const filters = and(
      eq(tasks.workspaceId, input.workspaceId),
      isNull(tasks.deletedAt),
      input.status === undefined ? undefined : eq(tasks.status, input.status),
      input.assigneeId === undefined
        ? undefined
        : eq(tasks.assigneeId, input.assigneeId),
    );
    const [rows, totals] = await Promise.all([
      this.database.db
        .select()
        .from(tasks)
        .where(and(filters, cursorFilter))
        .orderBy(desc(tasks.createdAt), desc(tasks.id))
        .limit(input.limit + 1),
      this.database.db.select({ value: count() }).from(tasks).where(filters),
    ]);
    return {
      items: rows.slice(0, input.limit),
      hasNext: rows.length > input.limit,
      total: totals[0]?.value ?? 0,
    };
  }

  async findAccess(taskId: string, userId: string): Promise<TaskAccess | null> {
    return first(
      await this.database.db
        .select({ task: tasks, role: memberships.role })
        .from(tasks)
        .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
        .innerJoin(
          memberships,
          and(
            eq(memberships.workspaceId, tasks.workspaceId),
            eq(memberships.userId, userId),
          ),
        )
        .where(
          and(
            eq(tasks.id, taskId),
            isNull(tasks.deletedAt),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1),
    );
  }

  async create(input: CreateTaskInput): Promise<CreateTaskResult> {
    return this.database.db.transaction(async (transaction) => {
      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(input.task.workspaceId))
          .for('update')
          .limit(1),
      );
      if (workspace === null) {
        return { type: 'workspace_not_found' } as const;
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, input.task.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (actor === null || !canWriteTasks(actor.role)) {
        return { type: 'forbidden' } as const;
      }

      if (input.task.contactId !== null) {
        const contact = first(
          await transaction
            .select({ id: contacts.id })
            .from(contacts)
            .where(
              and(
                eq(contacts.id, input.task.contactId),
                eq(contacts.workspaceId, input.task.workspaceId),
                isNull(contacts.deletedAt),
              ),
            )
            .limit(1),
        );
        if (contact === null) {
          return {
            type: 'reference_not_found',
            reference: {
              resource: 'Contact',
              identifier: input.task.contactId,
            },
          } as const;
        }
      }

      if (input.task.dealId !== null) {
        const deal = first(
          await transaction
            .select({ id: deals.id })
            .from(deals)
            .where(
              and(
                eq(deals.id, input.task.dealId),
                eq(deals.workspaceId, input.task.workspaceId),
                isNull(deals.deletedAt),
              ),
            )
            .limit(1),
        );
        if (deal === null) {
          return {
            type: 'reference_not_found',
            reference: { resource: 'Deal', identifier: input.task.dealId },
          } as const;
        }
      }

      if (input.task.assigneeId !== null) {
        const assignee = first(
          await transaction
            .select({ id: memberships.id })
            .from(memberships)
            .where(
              and(
                eq(memberships.id, input.task.assigneeId),
                eq(memberships.workspaceId, input.task.workspaceId),
              ),
            )
            .limit(1),
        );
        if (assignee === null) {
          return {
            type: 'reference_not_found',
            reference: {
              resource: 'Workspace member',
              identifier: input.task.assigneeId,
            },
          } as const;
        }
      }

      const task = first(
        await transaction.insert(tasks).values(input.task).returning(),
      );
      if (task === null) {
        throw new Error('The task insert returned no row.');
      }
      return { type: 'created', task } as const;
    });
  }

  async update(input: UpdateTaskInput): Promise<UpdateTaskResult> {
    return this.database.db.transaction(async (transaction) => {
      const taskWorkspace = first(
        await transaction
          .select({ workspaceId: tasks.workspaceId })
          .from(tasks)
          .where(activeTaskFilter(input.taskId))
          .limit(1),
      );
      if (taskWorkspace === null) {
        return { type: 'not_found' } as const;
      }

      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(taskWorkspace.workspaceId))
          .for('update')
          .limit(1),
      );
      if (workspace === null) {
        return { type: 'not_found' } as const;
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, taskWorkspace.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (actor === null || !canWriteTasks(actor.role)) {
        return { type: 'forbidden' } as const;
      }

      const current = first(
        await transaction
          .select()
          .from(tasks)
          .where(activeTaskFilter(input.taskId))
          .for('update')
          .limit(1),
      );
      if (current === null) {
        return { type: 'not_found' } as const;
      }

      if (
        input.changes.status !== undefined &&
        !canPatchTaskStatus(current.status, input.changes.status)
      ) {
        return { type: 'invalid_status_transition' } as const;
      }

      if (
        input.changes.contactId !== undefined &&
        input.changes.contactId !== null
      ) {
        const contact = first(
          await transaction
            .select({ id: contacts.id })
            .from(contacts)
            .where(
              and(
                eq(contacts.id, input.changes.contactId),
                eq(contacts.workspaceId, current.workspaceId),
                isNull(contacts.deletedAt),
              ),
            )
            .limit(1),
        );
        if (contact === null) {
          return {
            type: 'reference_not_found',
            reference: {
              resource: 'Contact',
              identifier: input.changes.contactId,
            },
          } as const;
        }
      }

      if (input.changes.dealId !== undefined && input.changes.dealId !== null) {
        const deal = first(
          await transaction
            .select({ id: deals.id })
            .from(deals)
            .where(
              and(
                eq(deals.id, input.changes.dealId),
                eq(deals.workspaceId, current.workspaceId),
                isNull(deals.deletedAt),
              ),
            )
            .limit(1),
        );
        if (deal === null) {
          return {
            type: 'reference_not_found',
            reference: {
              resource: 'Deal',
              identifier: input.changes.dealId,
            },
          } as const;
        }
      }

      if (!this.hasChanges(current, input.changes)) {
        return { type: 'unchanged', task: current } as const;
      }

      const updated = first(
        await transaction
          .update(tasks)
          .set({ ...this.toChanges(input.changes), updatedAt: input.updatedAt })
          .where(activeTaskFilter(input.taskId))
          .returning(),
      );
      return updated === null
        ? ({ type: 'not_found' } as const)
        : ({ type: 'updated', task: updated } as const);
    });
  }

  async assign(input: AssignTaskInput): Promise<AssignTaskResult> {
    return this.database.db.transaction(async (transaction) => {
      const taskWorkspace = first(
        await transaction
          .select({ workspaceId: tasks.workspaceId })
          .from(tasks)
          .where(activeTaskFilter(input.taskId))
          .limit(1),
      );
      if (taskWorkspace === null) {
        return { type: 'not_found' } as const;
      }

      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(taskWorkspace.workspaceId))
          .for('update')
          .limit(1),
      );
      if (workspace === null) {
        return { type: 'not_found' } as const;
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, taskWorkspace.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (actor === null || !canWriteTasks(actor.role)) {
        return { type: 'forbidden' } as const;
      }

      const current = first(
        await transaction
          .select()
          .from(tasks)
          .where(activeTaskFilter(input.taskId))
          .for('update')
          .limit(1),
      );
      if (current === null) {
        return { type: 'not_found' } as const;
      }

      const assignee = first(
        await transaction
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.id, input.memberId),
              eq(memberships.workspaceId, current.workspaceId),
            ),
          )
          .limit(1),
      );
      if (assignee === null) {
        return {
          type: 'reference_not_found',
          reference: {
            resource: 'Workspace member',
            identifier: input.memberId,
          },
        } as const;
      }

      if (current.assigneeId === input.memberId) {
        return { type: 'unchanged', task: current } as const;
      }

      const assigned = first(
        await transaction
          .update(tasks)
          .set({ assigneeId: input.memberId, updatedAt: input.updatedAt })
          .where(activeTaskFilter(input.taskId))
          .returning(),
      );
      return assigned === null
        ? ({ type: 'not_found' } as const)
        : ({ type: 'assigned', task: assigned } as const);
    });
  }

  async transitionStatus(
    input: TransitionTaskStatusInput,
  ): Promise<TransitionTaskStatusResult> {
    return this.database.db.transaction(async (transaction) => {
      const taskWorkspace = first(
        await transaction
          .select({ workspaceId: tasks.workspaceId })
          .from(tasks)
          .where(activeTaskFilter(input.taskId))
          .limit(1),
      );
      if (taskWorkspace === null) {
        return { type: 'not_found' } as const;
      }

      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(taskWorkspace.workspaceId))
          .for('update')
          .limit(1),
      );
      if (workspace === null) {
        return { type: 'not_found' } as const;
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, taskWorkspace.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (actor === null || !canWriteTasks(actor.role)) {
        return { type: 'forbidden' } as const;
      }

      const current = first(
        await transaction
          .select()
          .from(tasks)
          .where(activeTaskFilter(input.taskId))
          .for('update')
          .limit(1),
      );
      if (current === null) {
        return { type: 'not_found' } as const;
      }

      const nextStatus =
        input.action === 'complete'
          ? statusAfterCompletion(current.status)
          : statusAfterReopen(current.status);
      if (nextStatus === current.status) {
        return { type: 'unchanged', task: current } as const;
      }

      const updated = first(
        await transaction
          .update(tasks)
          .set({ status: nextStatus, updatedAt: input.updatedAt })
          .where(activeTaskFilter(input.taskId))
          .returning(),
      );
      return updated === null
        ? ({ type: 'not_found' } as const)
        : ({ type: 'updated', task: updated } as const);
    });
  }

  async softDelete(input: DeleteTaskInput): Promise<DeleteTaskResult> {
    return this.database.db.transaction(async (transaction) => {
      const current = first(
        await transaction
          .select({ workspaceId: tasks.workspaceId })
          .from(tasks)
          .where(activeTaskFilter(input.taskId))
          .limit(1),
      );
      if (current === null) {
        return { type: 'not_found' } as const;
      }

      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(current.workspaceId))
          .for('update')
          .limit(1),
      );
      if (workspace === null) {
        return { type: 'not_found' } as const;
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, current.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (actor === null || !canWriteTasks(actor.role)) {
        return { type: 'forbidden' } as const;
      }

      const deleted = await transaction
        .update(tasks)
        .set({ deletedAt: input.deletedAt, updatedAt: input.deletedAt })
        .where(activeTaskFilter(input.taskId))
        .returning({ id: tasks.id });
      return deleted.length === 0
        ? ({ type: 'not_found' } as const)
        : ({ type: 'deleted' } as const);
    });
  }

  private toChanges(changes: TaskChanges): TaskChanges {
    return {
      ...(changes.title === undefined ? {} : { title: changes.title }),
      ...(changes.contactId === undefined
        ? {}
        : { contactId: changes.contactId }),
      ...(changes.dealId === undefined ? {} : { dealId: changes.dealId }),
      ...(changes.dueDate === undefined ? {} : { dueDate: changes.dueDate }),
      ...(changes.status === undefined ? {} : { status: changes.status }),
    };
  }

  private hasChanges(task: Task, changes: TaskChanges): boolean {
    return (
      (changes.title !== undefined && changes.title !== task.title) ||
      (changes.contactId !== undefined &&
        changes.contactId !== task.contactId) ||
      (changes.dealId !== undefined && changes.dealId !== task.dealId) ||
      (changes.status !== undefined && changes.status !== task.status) ||
      (changes.dueDate !== undefined &&
        changes.dueDate?.getTime() !== task.dueDate?.getTime())
    );
  }
}
