import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { WorkspaceMembershipAccess } from '../../domain/workspace-membership';
import type { WorkspaceRequest } from '../../infrastructure/workspace-request';

export const CurrentWorkspaceAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): WorkspaceMembershipAccess => {
    const request = context.switchToHttp().getRequest<WorkspaceRequest>();
    return request.workspaceAccess as WorkspaceMembershipAccess;
  },
);
