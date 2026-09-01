import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import { ResourceConflictException } from '../../../common/exceptions/resource-conflict.exception';
import { ValidationException } from '../../../common/exceptions/validation.exception';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import type { EventDispatchAttempt } from '../domain/event-dispatch';
import { isEventType, type EventType, type StoredEvent } from '../domain/event';
import {
  EVENT_DISPATCH_QUEUE,
  type EventDispatchQueue,
} from './ports/event-dispatch-queue.port';
import {
  EVENT_STORE,
  type AppendEventInput,
  type EventStore,
} from './ports/event-store.port';

export interface ListEventsQuery {
  cursor?: string;
  limit: number;
  eventType?: EventType;
  from?: string;
  to?: string;
}

@Injectable()
export class EventingService {
  constructor(
    @Inject(EVENT_STORE) private readonly eventStore: EventStore,
    @Inject(EVENT_DISPATCH_QUEUE)
    private readonly dispatchQueue: EventDispatchQueue,
  ) {}

  async list(
    workspaceId: string,
    query: ListEventsQuery,
  ): Promise<CursorPaginatedResult<StoredEvent>> {
    const from = this.toDate('from', query.from);
    const to = this.toDate('to', query.to);
    if (from !== undefined && to !== undefined && from > to) {
      throw new ValidationException([
        {
          field: 'from',
          constraints: ['from must be earlier than or equal to to'],
        },
      ]);
    }

    const page = await this.eventStore.list({
      workspaceId,
      cursor: query.cursor === undefined ? null : decodeCursor(query.cursor),
      limit: query.limit,
      ...(query.eventType === undefined ? {} : { eventType: query.eventType }),
      ...(from === undefined ? {} : { from }),
      ...(to === undefined ? {} : { to }),
    });
    const last = page.items.at(-1);
    return {
      paginationType: 'cursor',
      items: page.items,
      cursor: query.cursor ?? null,
      nextCursor:
        page.hasNext && last !== undefined
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
      hasNext: page.hasNext,
      limit: query.limit,
      total: page.total,
    };
  }

  async append(input: AppendEventInput): Promise<StoredEvent> {
    if (!isEventType(input.eventType)) {
      throw new ValidationException([
        {
          field: 'eventType',
          constraints: ['eventType must be a supported event catalog entry'],
        },
      ]);
    }
    if (
      input.idempotencyKey !== undefined &&
      (input.idempotencyKey.length === 0 || input.idempotencyKey.length > 255)
    ) {
      throw new ValidationException([
        {
          field: 'idempotencyKey',
          constraints: [
            'idempotencyKey must contain between 1 and 255 characters',
          ],
        },
      ]);
    }
    const result = await this.eventStore.append(input);
    if (result.type === 'idempotency_conflict') {
      throw new ResourceConflictException(
        'The idempotency key has already been used for a different event.',
        { idempotencyKey: input.idempotencyKey },
      );
    }
    return result.event;
  }

  async reprocess(eventId: string): Promise<EventDispatchAttempt> {
    return this.dispatchQueue.enqueue({ eventId });
  }

  forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this event.',
      HttpStatus.FORBIDDEN,
    );
  }

  private toDate(field: 'from' | 'to', value?: string): Date | undefined {
    if (value === undefined) {
      return undefined;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new ValidationException([
        { field, constraints: [`${field} must be a valid ISO 8601 date`] },
      ]);
    }
    return date;
  }
}
