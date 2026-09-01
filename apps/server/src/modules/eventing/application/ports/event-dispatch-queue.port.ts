import type { EventDispatchAttempt } from '../../domain/event-dispatch';

export const EVENT_DISPATCH_QUEUE = Symbol('EVENT_DISPATCH_QUEUE');

export interface EnqueueEventDispatchInput {
  eventId: string;
  availableAt?: Date;
}

export interface ClaimEventDispatchInput {
  workerId: string;
  now: Date;
  lockExpiredBefore: Date;
}

export interface CompleteEventDispatchInput {
  dispatchId: string;
  workerId: string;
  completedAt: Date;
}

export interface FailEventDispatchInput {
  dispatchId: string;
  workerId: string;
  error: string;
  availableAt: Date;
  failedAt: Date;
}

/**
 * Queue boundary for event delivery. The default implementation persists a
 * PENDING outbox row and deliberately does not claim downstream delivery.
 */
export interface EventDispatchQueue {
  enqueue(input: EnqueueEventDispatchInput): Promise<EventDispatchAttempt>;
  claimNext(
    input: ClaimEventDispatchInput,
  ): Promise<EventDispatchAttempt | null>;
  markSucceeded(input: CompleteEventDispatchInput): Promise<boolean>;
  markFailed(input: FailEventDispatchInput): Promise<boolean>;
}
