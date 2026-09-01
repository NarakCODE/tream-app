import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, isNull, lt, lte, or } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import { events } from '../../../database/schema/event.schema';
import {
  memberships,
  workspaces,
} from '../../../database/schema/workspace.schema';
import type {
  AppendEventInput,
  AppendEventResult,
  EventAccess,
  EventPage,
  EventStore,
  ListEventsInput,
} from '../application/ports/event-store.port';
import { isEventType, type StoredEvent } from '../domain/event';
import { appendEventInTransaction } from './transactional-event-appender';

const first = <T>(values: T[]): T | null => values[0] ?? null;

const toStoredEvent = (row: typeof events.$inferSelect): StoredEvent => {
  if (!isEventType(row.eventType)) {
    throw new Error(`Unknown persisted event type: ${row.eventType}`);
  }
  return { ...row, eventType: row.eventType };
};

@Injectable()
export class DrizzleEventStore implements EventStore {
  constructor(private readonly database: DatabaseService) {}

  async list(input: ListEventsInput): Promise<EventPage> {
    const filters = and(
      eq(events.workspaceId, input.workspaceId),
      input.eventType === undefined
        ? undefined
        : eq(events.eventType, input.eventType),
      input.from === undefined ? undefined : gte(events.createdAt, input.from),
      input.to === undefined ? undefined : lte(events.createdAt, input.to),
    );
    const cursorFilter =
      input.cursor === null
        ? undefined
        : or(
            lt(events.createdAt, input.cursor.createdAt),
            and(
              eq(events.createdAt, input.cursor.createdAt),
              lt(events.id, input.cursor.id),
            ),
          );
    const [rows, totals] = await Promise.all([
      this.database.db
        .select()
        .from(events)
        .where(and(filters, cursorFilter))
        .orderBy(desc(events.createdAt), desc(events.id))
        .limit(input.limit + 1),
      this.database.db.select({ value: count() }).from(events).where(filters),
    ]);
    return {
      items: rows.slice(0, input.limit).map(toStoredEvent),
      hasNext: rows.length > input.limit,
      total: totals[0]?.value ?? 0,
    };
  }

  async findAccess(
    eventId: string,
    userId: string,
  ): Promise<EventAccess | null> {
    const row = first(
      await this.database.db
        .select({ event: events, role: memberships.role })
        .from(events)
        .innerJoin(workspaces, eq(workspaces.id, events.workspaceId))
        .innerJoin(
          memberships,
          and(
            eq(memberships.workspaceId, events.workspaceId),
            eq(memberships.userId, userId),
          ),
        )
        .where(and(eq(events.id, eventId), isNull(workspaces.deletedAt)))
        .limit(1),
    );
    return row === null
      ? null
      : { event: toStoredEvent(row.event), role: row.role };
  }

  append(input: AppendEventInput): Promise<AppendEventResult> {
    return this.database.db.transaction((transaction) =>
      appendEventInTransaction(transaction, input),
    );
  }
}
