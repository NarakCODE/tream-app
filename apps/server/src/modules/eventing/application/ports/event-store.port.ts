import type { CursorTuple } from '../../../../common/pagination/cursor';
import type { WorkspaceRole } from '../../../iam/domain/workspace-membership';
import type { EventType, StoredEvent } from '../../domain/event';

export const EVENT_STORE = Symbol('EVENT_STORE');

export interface ListEventsInput {
  workspaceId: string;
  cursor: CursorTuple | null;
  limit: number;
  eventType?: EventType;
  from?: Date;
  to?: Date;
}

export interface EventPage {
  items: StoredEvent[];
  hasNext: boolean;
  total: number;
}

export interface EventAccess {
  event: StoredEvent;
  role: WorkspaceRole;
}

export interface AppendEventInput {
  workspaceId: string;
  eventType: EventType;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  createdAt?: Date;
}

export type AppendEventResult =
  | { type: 'appended'; event: StoredEvent }
  | { type: 'duplicate'; event: StoredEvent }
  | { type: 'idempotency_conflict'; event: StoredEvent };

export interface EventStore {
  list(input: ListEventsInput): Promise<EventPage>;
  findAccess(eventId: string, userId: string): Promise<EventAccess | null>;
  append(input: AppendEventInput): Promise<AppendEventResult>;
}
