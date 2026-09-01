export const EVENT_DISPATCH_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
] as const;

export type EventDispatchStatus = (typeof EVENT_DISPATCH_STATUSES)[number];

export interface EventDispatchAttempt {
  id: string;
  eventId: string;
  status: EventDispatchStatus;
  attemptCount: number;
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  completedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}
