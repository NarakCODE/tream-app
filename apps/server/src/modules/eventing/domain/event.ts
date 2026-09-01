export const EVENT_TYPES = [
  'workspace.created',
  'database.record.created',
  'database.record.updated',
  'database.record.deleted',
  'contact.created',
  'contact.updated',
  'deal.created',
  'deal.stage_changed',
  'task.created',
  'task.completed',
  'email.received',
  'email.sent',
  'agent.run.completed',
  'agent.run.failed',
  'team.created',
  'team.updated',
  'team.retired',
  'project.created',
  'project.updated',
  'project.completed',
  'project.canceled',
  'issue.created',
  'issue.updated',
  'issue.assigned',
  'issue.status_changed',
  'issue.deleted',
  'cycle.created',
  'cycle.started',
  'cycle.completed',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface StoredEvent {
  id: string;
  workspaceId: string;
  eventType: EventType;
  payload: Record<string, unknown>;
  idempotencyKey: string | null;
  createdAt: Date;
}

export const isEventType = (value: string): value is EventType =>
  EVENT_TYPES.some((eventType) => eventType === value);
