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
  INTEGRATIONS_REPOSITORY,
  type IntegrationsRepository,
} from '../application/ports/integrations-repository.port';
import {
  canReadIntegrations,
  canWriteIntegrations,
} from '../domain/integration-role-policy';
import {
  INTEGRATION_ACCESS_MODE_KEY,
  type IntegrationAccessMode,
} from '../presentation/decorators/integration-access.decorator';
import type { IntegrationRequest } from './integration-request';

@Injectable()
export class IntegrationAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(INTEGRATIONS_REPOSITORY)
    private readonly repository: IntegrationsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IntegrationRequest>();
    const integrationId = request.params.integrationId;
    const user = request.user;
    if (integrationId === undefined || user === undefined)
      throw this.forbidden();
    const access = await this.repository.findAccess(integrationId, user.id);
    if (access === null) throw this.forbidden();
    const mode =
      this.reflector.getAllAndOverride<IntegrationAccessMode>(
        INTEGRATION_ACCESS_MODE_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? 'read';
    const allowed =
      mode === 'write'
        ? canWriteIntegrations(access.role)
        : canReadIntegrations(access.role);
    if (!allowed) throw this.forbidden();
    request.integrationAccess = access;
    return true;
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this integration.',
      HttpStatus.FORBIDDEN,
    );
  }
}
