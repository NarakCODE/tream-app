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
  TEAMS_REPOSITORY,
  type TeamsRepository,
} from '../application/ports/teams-repository.port';
import {
  canAdministerWorkManagement,
  canReadWorkManagement,
  canWriteWorkManagement,
} from '../domain/work-management-roles';
import {
  WORK_MANAGEMENT_ACCESS_MODE_KEY,
  type WorkManagementAccessMode,
} from '../presentation/decorators/work-management-access.decorator';
import type { TeamRequest } from './work-management-request';

@Injectable()
export class TeamAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TEAMS_REPOSITORY)
    private readonly repository: TeamsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TeamRequest>();
    const teamId = request.params.teamId;
    const user = request.user;
    if (teamId === undefined || user === undefined) {
      throw this.forbidden();
    }

    const access = await this.repository.findAccess(teamId, user.id);
    if (access === null) {
      throw this.forbidden();
    }

    const mode =
      this.reflector.getAllAndOverride<WorkManagementAccessMode>(
        WORK_MANAGEMENT_ACCESS_MODE_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? 'read';

    let allowed = false;
    if (mode === 'admin') {
      allowed = canAdministerWorkManagement(access.role);
    } else if (mode === 'write') {
      allowed = canWriteWorkManagement(access.role);
    } else {
      allowed = canReadWorkManagement(access.role);
    }

    if (!allowed) {
      throw this.forbidden();
    }

    request.teamAccess = access;
    return true;
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this team.',
      HttpStatus.FORBIDDEN,
    );
  }
}
