import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../../../../database/database.service';
import type { AuthenticatedPrincipal } from '../../../../common/auth/principal';
import { WorkspaceAuthorizationService } from '../application/workspace-authorization.service';
import type { WorkspacePermission } from '../domain/permissions';
const PERMISSION = 'workspace-permission';
interface RequiredPermission {
  permission: WorkspacePermission;
  archived?: boolean;
  deleted?: boolean;
}
export const RequireWorkspacePermission = (
  permission: WorkspacePermission,
  options: { archived?: boolean; deleted?: boolean } = {},
) =>
  applyDecorators(
    SetMetadata(PERMISSION, { permission, ...options }),
    UseGuards(WorkspacePermissionGuard),
  );
@Injectable()
export class WorkspacePermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<RequiredPermission>(
      PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;
    const request = context.switchToHttp().getRequest<{
      user: AuthenticatedPrincipal;
      params: { workspaceId: string };
    }>();
    await this.db.db.transaction(async (tx) => {
      await this.authorization.require(
        tx,
        request.user.id,
        request.params.workspaceId,
        requirement.permission,
        requirement,
      );
    });
    return true;
  }
}
