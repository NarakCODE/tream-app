import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../application/ports/workspace-repository.port';
import type { WorkspaceRole } from '../domain/workspace-membership';
import type { WorkspaceRequest } from './workspace-request';
import { WORKSPACE_ROLES_KEY } from '../presentation/decorators/workspace-roles.decorator';

@Injectable()
export class WorkspaceMembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(WORKSPACE_REPOSITORY)
    private readonly repository: WorkspaceRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WorkspaceRequest>();
    const workspaceId = request.params.workspaceId;
    const user = request.user;
    if (workspaceId === undefined || user === undefined) {
      throw this.forbidden();
    }

    const access = await this.repository.findActiveWorkspaceMembership(
      workspaceId,
      user.id,
    );
    if (access === null) {
      throw this.forbidden();
    }

    const allowedRoles = this.reflector.getAllAndOverride<WorkspaceRole[]>(
      WORKSPACE_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (
      allowedRoles !== undefined &&
      !allowedRoles.includes(access.membership.role)
    ) {
      throw this.forbidden();
    }

    request.workspaceAccess = access;
    return true;
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this workspace.',
      HttpStatus.FORBIDDEN,
    );
  }
}
