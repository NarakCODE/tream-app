import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { TaskAccess } from '../../application/ports/tasks-repository.port';
import type { TaskRequest } from '../../infrastructure/task-request';

export const CurrentTaskAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TaskAccess => {
    const request = context.switchToHttp().getRequest<TaskRequest>();
    return request.taskAccess as TaskAccess;
  },
);
