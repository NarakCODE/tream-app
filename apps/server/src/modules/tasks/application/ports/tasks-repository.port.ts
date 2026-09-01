import type { CursorTuple } from '../../../../common/pagination/cursor';
import type { WorkspaceRole } from '../../../iam/domain/workspace-membership';
import type { Task, TaskStatus } from '../../domain/task';
import type { TaskPatchStatus } from '../../domain/task-status-policy';

export const TASKS_REPOSITORY = Symbol('TASKS_REPOSITORY');

export interface TaskAccess {
  task: Task;
  role: WorkspaceRole;
}

export interface ListTasksInput {
  workspaceId: string;
  cursor: CursorTuple | null;
  limit: number;
  status?: TaskStatus;
  assigneeId?: string;
}

export interface TaskPage {
  items: Task[];
  hasNext: boolean;
  total: number;
}

export interface CreateTaskInput {
  task: Task;
  actorUserId: string;
}

export type TaskReference =
  | { resource: 'Contact'; identifier: string }
  | { resource: 'Deal'; identifier: string }
  | { resource: 'Workspace member'; identifier: string };

export type CreateTaskResult =
  | { type: 'created'; task: Task }
  | { type: 'workspace_not_found' }
  | { type: 'forbidden' }
  | { type: 'reference_not_found'; reference: TaskReference };

export interface TaskChanges {
  title?: string;
  contactId?: string | null;
  dealId?: string | null;
  dueDate?: Date | null;
  status?: TaskPatchStatus;
}

export interface UpdateTaskInput {
  taskId: string;
  actorUserId: string;
  changes: TaskChanges;
  updatedAt: Date;
}

export type UpdateTaskResult =
  | { type: 'updated'; task: Task }
  | { type: 'unchanged'; task: Task }
  | { type: 'not_found' }
  | { type: 'forbidden' }
  | { type: 'reference_not_found'; reference: TaskReference }
  | { type: 'invalid_status_transition' };

export interface AssignTaskInput {
  taskId: string;
  actorUserId: string;
  memberId: string;
  updatedAt: Date;
}

export type AssignTaskResult =
  | { type: 'assigned'; task: Task }
  | { type: 'unchanged'; task: Task }
  | { type: 'not_found' }
  | { type: 'forbidden' }
  | { type: 'reference_not_found'; reference: TaskReference };

export interface TransitionTaskStatusInput {
  taskId: string;
  actorUserId: string;
  action: 'complete' | 'reopen';
  updatedAt: Date;
}

export type TransitionTaskStatusResult =
  | { type: 'updated'; task: Task }
  | { type: 'unchanged'; task: Task }
  | { type: 'not_found' }
  | { type: 'forbidden' };

export interface DeleteTaskInput {
  taskId: string;
  actorUserId: string;
  deletedAt: Date;
}

export type DeleteTaskResult =
  { type: 'deleted' } | { type: 'not_found' } | { type: 'forbidden' };

export interface TasksRepository {
  list(input: ListTasksInput): Promise<TaskPage>;
  findAccess(taskId: string, userId: string): Promise<TaskAccess | null>;
  create(input: CreateTaskInput): Promise<CreateTaskResult>;
  update(input: UpdateTaskInput): Promise<UpdateTaskResult>;
  assign(input: AssignTaskInput): Promise<AssignTaskResult>;
  transitionStatus(
    input: TransitionTaskStatusInput,
  ): Promise<TransitionTaskStatusResult>;
  softDelete(input: DeleteTaskInput): Promise<DeleteTaskResult>;
}
