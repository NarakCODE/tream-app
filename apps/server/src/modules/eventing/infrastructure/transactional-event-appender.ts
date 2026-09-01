import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { DatabaseService } from '../../../database/database.service';
import {
  eventDispatchAttempts,
  events,
} from '../../../database/schema/event.schema';
import type {
  AppendEventInput,
  AppendEventResult,
} from '../application/ports/event-store.port';
import { isEventType, type StoredEvent } from '../domain/event';

export type EventStoreTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

const first = <T>(values: T[]): T | null => values[0] ?? null;

const toStoredEvent = (row: typeof events.$inferSelect): StoredEvent => {
  if (!isEventType(row.eventType)) {
    throw new Error(`Unknown persisted event type: ${row.eventType}`);
  }
  return { ...row, eventType: row.eventType };
};

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

/**
 * Appends an event and its initial PENDING dispatch row using the caller's
 * Drizzle transaction. CRM and other write repositories can use this helper
 * to implement the transactional outbox pattern without depending on Nest DI.
 */
export const appendEventInTransaction = async (
  transaction: EventStoreTransaction,
  input: AppendEventInput,
): Promise<AppendEventResult> => {
  if (!isEventType(input.eventType)) {
    throw new Error(`Unsupported event type: ${String(input.eventType)}`);
  }
  const event = {
    id: `evt_${ulid()}`,
    workspaceId: input.workspaceId,
    eventType: input.eventType,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey ?? null,
    createdAt: input.createdAt ?? new Date(),
  };
  const inserted = first(
    await transaction
      .insert(events)
      .values(event)
      .onConflictDoNothing()
      .returning(),
  );

  if (inserted === null) {
    if (input.idempotencyKey === undefined) {
      throw new Error(
        'The event insert conflicted without an idempotency key.',
      );
    }
    const existing = first(
      await transaction
        .select()
        .from(events)
        .where(
          and(
            eq(events.workspaceId, input.workspaceId),
            eq(events.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1),
    );
    if (existing === null) {
      throw new Error(
        'The event insert conflicted but no matching event exists.',
      );
    }
    const stored = toStoredEvent(existing);
    return sameEventRequest(stored, input)
      ? { type: 'duplicate', event: stored }
      : { type: 'idempotency_conflict', event: stored };
  }

  await transaction.insert(eventDispatchAttempts).values({
    id: `edp_${ulid()}`,
    eventId: inserted.id,
    availableAt: inserted.createdAt,
    createdAt: inserted.createdAt,
    updatedAt: inserted.createdAt,
  });
  return { type: 'appended', event: toStoredEvent(inserted) };
};
