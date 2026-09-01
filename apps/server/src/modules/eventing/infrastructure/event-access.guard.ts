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
  EVENT_STORE,
  type EventStore,
} from '../application/ports/event-store.port';
import { canReadEvents, canReprocessEvents } from '../domain/event-role-policy';
import {
  EVENT_ACCESS_MODE_KEY,
  type EventAccessMode,
} from '../presentation/decorators/event-access.decorator';
import type { EventRequest } from './event-request';

@Injectable()
export class EventAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(EVENT_STORE) private readonly eventStore: EventStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<EventRequest>();
    const eventId = request.params.eventId;
    const user = request.user;
    if (eventId === undefined || user === undefined) {
      throw this.forbidden();
    }

    const access = await this.eventStore.findAccess(eventId, user.id);
    if (access === null) {
      throw this.forbidden();
    }
    const mode =
      this.reflector.getAllAndOverride<EventAccessMode>(EVENT_ACCESS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'read';
    const allowed =
      mode === 'reprocess'
        ? canReprocessEvents(access.role)
        : canReadEvents(access.role);
    if (!allowed) {
      throw this.forbidden();
    }

    request.eventAccess = access;
    return true;
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this event.',
      HttpStatus.FORBIDDEN,
    );
  }
}
