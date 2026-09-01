import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { DealAccess } from '../../application/ports/deals-repository.port';
import type { DealRequest } from '../../infrastructure/deal-request';

export const CurrentDealAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): DealAccess => {
    const request = context.switchToHttp().getRequest<DealRequest>();
    return request.dealAccess as DealAccess;
  },
);
