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
  CYCLES_REPOSITORY,
  type CyclesRepository,
} from '../application/ports/cycles-repository.port';
import {
  canAdministerWorkManagement,
  canReadWorkManagement,
  canWriteWorkManagement,
} from '../domain/work-management-roles';
import {
  WORK_MANAGEMENT_ACCESS_MODE_KEY,
  type WorkManagementAccessMode,
} from '../presentation/decorators/work-management-access.decorator';
import type { CycleRequest } from './work-management-request';

@Injectable()
export class CycleAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CYCLES_REPOSITORY)
    private readonly repository: CyclesRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CycleRequest>();
    const cycleId = request.params.cycleId;
    const user = request.user;
    if (cycleId === undefined || user === undefined) {
      throw this.forbidden();
    }

    const access = await this.repository.findAccess(cycleId, user.id);
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

    request.cycleAccess = access;
    return true;
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this cycle.',
      HttpStatus.FORBIDDEN,
    );
  }
}
