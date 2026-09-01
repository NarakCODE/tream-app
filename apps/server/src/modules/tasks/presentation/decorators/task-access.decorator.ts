import { SetMetadata } from '@nestjs/common';

export const TASK_ACCESS_MODE_KEY = 'task_access_mode';
export type TaskAccessMode = 'read' | 'write';

export const TaskAccessMode = (mode: TaskAccessMode): MethodDecorator =>
  SetMetadata(TASK_ACCESS_MODE_KEY, mode);
