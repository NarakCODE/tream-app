import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { IntegrationAccess } from '../../application/ports/integrations-repository.port';
import type { IntegrationRequest } from '../../infrastructure/integration-request';

export const CurrentIntegrationAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IntegrationAccess => {
    const request = context.switchToHttp().getRequest<IntegrationRequest>();
    if (request.integrationAccess === undefined) {
      throw new Error('Integration access was not resolved by the guard.');
    }
    return request.integrationAccess;
  },
);
