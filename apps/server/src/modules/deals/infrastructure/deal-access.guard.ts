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
  DEALS_REPOSITORY,
  type DealsRepository,
} from '../application/ports/deals-repository.port';
import { canReadDeals, canWriteDeals } from '../domain/deal-role-policy';
import {
  DEAL_ACCESS_MODE_KEY,
  type DealAccessMode,
} from '../presentation/decorators/deal-access.decorator';
import type { DealRequest } from './deal-request';

@Injectable()
export class DealAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DEALS_REPOSITORY)
    private readonly repository: DealsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DealRequest>();
    const dealId = request.params.dealId;
    const user = request.user;
    if (dealId === undefined || user === undefined) {
      throw this.forbidden();
    }

    const access = await this.repository.findAccess(dealId, user.id);
    if (access === null) {
      throw this.forbidden();
    }

    const mode =
      this.reflector.getAllAndOverride<DealAccessMode>(DEAL_ACCESS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'read';
    const allowed =
      mode === 'write' ? canWriteDeals(access.role) : canReadDeals(access.role);
    if (!allowed) {
      throw this.forbidden();
    }

    request.dealAccess = access;
    return true;
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this deal.',
      HttpStatus.FORBIDDEN,
    );
  }
}
