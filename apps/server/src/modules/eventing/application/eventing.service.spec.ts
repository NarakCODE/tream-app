import { Test, type TestingModule } from '@nestjs/testing';
import { ResourceConflictException } from '../../../common/exceptions/resource-conflict.exception';
import { ValidationException } from '../../../common/exceptions/validation.exception';
import type { EventDispatchAttempt } from '../domain/event-dispatch';
import type { EventType, StoredEvent } from '../domain/event';
import {
  EVENT_DISPATCH_QUEUE,
  type EventDispatchQueue,
} from './ports/event-dispatch-queue.port';
import { EVENT_STORE, type EventStore } from './ports/event-store.port';
import { EventingService } from './eventing.service';

const event: StoredEvent = {
  id: 'evt_01J8A4ZS9VBD8XAADETY7SKHMA',
  workspaceId: 'ws_01J8A4MS9VBD8XAADETY7SKHMA',
  eventType: 'contact.created',
  payload: { contactId: 'con_01J8A4ZS9VBD8XAADETY7SKHMA' },
  idempotencyKey: 'contact-create-1',
  createdAt: new Date('2026-08-30T10:30:00.000Z'),
};

const dispatch: EventDispatchAttempt = {
  id: 'edp_01J8A4ZS9VBD8XAADETY7SKHMA',
  eventId: event.id,
  status: 'PENDING',
  attemptCount: 0,
  availableAt: event.createdAt,
  lockedAt: null,
  lockedBy: null,
  completedAt: null,
  lastError: null,
  createdAt: event.createdAt,
  updatedAt: event.createdAt,
};

describe('EventingService', () => {
  let service: EventingService;
  let eventStore: jest.Mocked<EventStore>;
  let dispatchQueue: jest.Mocked<EventDispatchQueue>;

  beforeEach(async () => {
    eventStore = {
      list: jest.fn(),
      findAccess: jest.fn(),
      append: jest.fn(),
    };
    dispatchQueue = {
      enqueue: jest.fn(),
      claimNext: jest.fn(),
      markSucceeded: jest.fn(),
      markFailed: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventingService,
        { provide: EVENT_STORE, useValue: eventStore },
        { provide: EVENT_DISPATCH_QUEUE, useValue: dispatchQueue },
      ],
    }).compile();
    service = module.get(EventingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('lists events with parsed date filters and a stable next cursor', async () => {
    eventStore.list.mockResolvedValue({
      items: [event],
      hasNext: true,
      total: 2,
    });

    const result = await service.list(event.workspaceId, {
      limit: 1,
      eventType: 'contact.created',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T00:00:00.000Z',
    });

    expect(result.nextCursor).not.toBeNull();
    expect(eventStore.list.mock.calls).toEqual([
      [
        {
          workspaceId: event.workspaceId,
          cursor: null,
          limit: 1,
          eventType: 'contact.created',
          from: new Date('2026-08-01T00:00:00.000Z'),
          to: new Date('2026-08-31T00:00:00.000Z'),
        },
      ],
    ]);
  });

  it('rejects an inverted date range before querying storage', async () => {
    await expect(
      service.list(event.workspaceId, {
        limit: 25,
        from: '2026-08-31T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(eventStore.list.mock.calls).toHaveLength(0);
  });

  it('returns the original event for an idempotent replay', async () => {
    eventStore.append.mockResolvedValue({ type: 'duplicate', event });

    await expect(
      service.append({
        workspaceId: event.workspaceId,
        eventType: event.eventType,
        payload: event.payload,
        idempotencyKey: 'contact-create-1',
      }),
    ).resolves.toBe(event);
  });

  it('rejects event types outside the standard catalog', async () => {
    await expect(
      service.append({
        workspaceId: event.workspaceId,
        eventType: 'contact.imported' as EventType,
        payload: {},
      }),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(eventStore.append.mock.calls).toHaveLength(0);
  });

  it('rejects reuse of an idempotency key for different event content', async () => {
    eventStore.append.mockResolvedValue({
      type: 'idempotency_conflict',
      event,
    });

    await expect(
      service.append({
        workspaceId: event.workspaceId,
        eventType: 'deal.created',
        payload: { dealId: 'del_01J8A4ZS9VBD8XAADETY7SKHMA' },
        idempotencyKey: 'contact-create-1',
      }),
    ).rejects.toBeInstanceOf(ResourceConflictException);
  });

  it('creates a pending durable dispatch when reprocessing', async () => {
    dispatchQueue.enqueue.mockResolvedValue(dispatch);

    await expect(service.reprocess(event.id)).resolves.toBe(dispatch);
    expect(dispatchQueue.enqueue.mock.calls).toEqual([[{ eventId: event.id }]]);
  });
});
