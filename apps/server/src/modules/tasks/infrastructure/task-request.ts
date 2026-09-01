import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import type { TaskAccess } from '../application/ports/tasks-repository.port';

export interface TaskRequest {
  params: { taskId?: string };
  user?: AuthenticatedUser;
  taskAccess?: TaskAccess;
}
