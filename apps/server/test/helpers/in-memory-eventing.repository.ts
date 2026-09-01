import { ulid } from 'ulid';
import type { CursorTuple } from '../../src/common/pagination/cursor';
import type {
  AppendEventInput,
  AppendEventResult,
  EventAccess,
  EventPage,
  EventStore,
  ListEventsInput,
} from '../../src/modules/eventing/application/ports/event-store.port';
import type {
  EnqueueEventDispatchInput,
  EventDispatchQueue,
} from '../../src/modules/eventing/application/ports/event-dispatch-queue.port';
import type { EventDispatchAttempt } from '../../src/modules/eventing/domain/event-dispatch';
import type {
  EventType,
  StoredEvent,
} from '../../src/modules/eventing/domain/event';
import type { InMemoryWorkspaceRepository } from './in-memory-workspace.repository';

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
};

const sameEventRequest = (
  event: StoredEvent,
  input: AppendEventInput,
): boolean =>
  event.eventType === input.eventType &&
  JSON.stringify(canonicalize(event.payload)) ===
    JSON.stringify(canonicalize(input.payload));

const compareCursor = (event: StoredEvent, cursor: CursorTuple): number => {
  const timestamp = event.createdAt.getTime() - cursor.createdAt.getTime();
  return timestamp === 0 ? event.id.localeCompare(cursor.id) : timestamp;
};

export class InMemoryEventingRepository
  implements EventStore, EventDispatchQueue
{
  private readonly events = new Map<string, StoredEvent>();
  private readonly attempts = new Map<string, EventDispatchAttempt>();
  private eventSequence = 0;
  private attemptSequence = 0;

  constructor(private readonly workspaces: InMemoryWorkspaceRepository) {}

  reset(): void {
    this.events.clear();
    this.attempts.clear();
    this.eventSequence = 0;
    this.attemptSequence = 0;
  }

  list(input: ListEventsInput): Promise<EventPage> {
    const rows = [...this.events.values()]
      .filter((event) => event.workspaceId === input.workspaceId)
      .filter((event) =>
        input.eventType === undefined
          ? true
          : event.eventType === input.eventType,
      )
      .filter((event) =>
        input.from === undefined ? true : event.createdAt >= input.from,
      )
      .filter((event) =>
        input.to === undefined ? true : event.createdAt <= input.to,
      )
      .sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.id.localeCompare(left.id),
      )
      .filter((event) =>
        input.cursor === null ? true : compareCursor(event, input.cursor) < 0,
      );
    return Promise.resolve({
      items: rows.slice(0, input.limit),
      hasNext: rows.length > input.limit,
      total: rows.length,
    });
  }

  async findAccess(
    eventId: string,
    userId: string,
  ): Promise<EventAccess | null> {
    const event = this.events.get(eventId);
    if (event === undefined) {
      return null;
    }
    const access = await this.workspaces.findActiveWorkspaceMembership(
      event.workspaceId,
      userId,
    );
    return access === null ? null : { event, role: access.membership.role };
  }

  async append(input: AppendEventInput): Promise<AppendEventResult> {
    return this.appendDurableEvent(input);
  }

  async appendDurableEvent(
    input: AppendEventInput,
  ): Promise<AppendEventResult> {
    if (input.idempotencyKey !== undefined) {
      const existing = [...this.events.values()].find(
        (event) =>
          event.workspaceId === input.workspaceId &&
          event.idempotencyKey === input.idempotencyKey,
      );
      if (existing !== undefined) {
        return sameEventRequest(existing, input)
          ? { type: 'duplicate', event: existing }
          : { type: 'idempotency_conflict', event: existing };
      }
    }

    const createdAt =
      input.createdAt ??
      new Date(Date.UTC(2026, 7, 30, 12, 0, this.eventSequence++));
    const event: StoredEvent = {
      id: `evt_${ulid()}`,
      workspaceId: input.workspaceId,
      eventType: input.eventType,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey ?? null,
      createdAt,
    };
    this.events.set(event.id, event);
    await this.enqueue({ eventId: event.id, availableAt: createdAt });
    return { type: 'appended', event };
  }

  enqueue(input: EnqueueEventDispatchInput): Promise<EventDispatchAttempt> {
    const now =
      input.availableAt ??
      new Date(Date.UTC(2026, 7, 30, 13, 0, this.attemptSequence++));
    const attempt: EventDispatchAttempt = {
      id: `edp_${ulid()}`,
      eventId: input.eventId,
      status: 'PENDING',
      attemptCount: 0,
      availableAt: now,
      lockedAt: null,
      lockedBy: null,
      completedAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.attempts.set(attempt.id, attempt);
    return Promise.resolve(attempt);
  }

  claimNext(): Promise<EventDispatchAttempt | null> {
    return Promise.resolve(null);
  }

  markSucceeded(): Promise<boolean> {
    return Promise.resolve(false);
  }

  markFailed(): Promise<boolean> {
    return Promise.resolve(false);
  }

  attemptsForEvent(eventId: string): EventDispatchAttempt[] {
    return [...this.attempts.values()].filter(
      (attempt) => attempt.eventId === eventId,
    );
  }

  eventsByType(eventType: EventType): StoredEvent[] {
    return [...this.events.values()].filter(
      (event) => event.eventType === eventType,
    );
  }
}
