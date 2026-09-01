import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { EventAccess } from '../../application/ports/event-store.port';
import type { EventRequest } from '../../infrastructure/event-request';

export const CurrentEventAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): EventAccess => {
    const request = context.switchToHttp().getRequest<EventRequest>();
    return request.eventAccess as EventAccess;
  },
);
