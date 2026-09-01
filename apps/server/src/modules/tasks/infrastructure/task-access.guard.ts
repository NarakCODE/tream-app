import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  TASKS_REPOSITORY,
  type TasksRepository,
} from '../application/ports/tasks-repository.port';
import { canReadTasks, canWriteTasks } from '../domain/task-role-policy';
import {
  TASK_ACCESS_MODE_KEY,
  type TaskAccessMode,
} from '../presentation/decorators/task-access.decorator';
import type { TaskRequest } from './task-request';

@Injectable()
export class TaskAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TASKS_REPOSITORY)
    private readonly repository: TasksRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TaskRequest>();
    const taskId = request.params.taskId;
    const user = request.user;
    if (taskId === undefined || user === undefined) {
      throw this.forbidden();
    }

    const access = await this.repository.findAccess(taskId, user.id);
    if (access === null) {
      throw this.forbidden();
    }

    const mode =
      this.reflector.getAllAndOverride<TaskAccessMode>(TASK_ACCESS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'read';
    const allowed =
      mode === 'write' ? canWriteTasks(access.role) : canReadTasks(access.role);
    if (!allowed) {
      throw this.forbidden();
    }

    request.taskAccess = access;
    return true;
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this task.',
      HttpStatus.FORBIDDEN,
    );
  }
}
