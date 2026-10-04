export type NotificationKind =
  'ASSIGNMENT' | 'MENTION' | 'SUBSCRIPTION' | 'PLANNING_UPDATE';
export type NotificationTarget = {
  type: 'issue' | 'project' | 'initiative' | 'document';
  id: string;
};
export const deliveryIdentity = (
  eventId: string,
  recipientId: string,
  kind: NotificationKind,
) => JSON.stringify([eventId, recipientId, kind]);
export const canNotify = (
  actorId: string | null,
  recipient: { id: string; state: string; disabledAt: Date | null },
) =>
  recipient.id !== actorId &&
  recipient.state === 'ACTIVE' &&
  recipient.disabledAt === null;
export const isDefinitiveMailRejection = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'responseCode' in error &&
  typeof error.responseCode === 'number' &&
  error.responseCode >= 400 &&
  error.responseCode <= 599;
export const MAX_MAIL_ATTEMPTS = 8;
export const MAIL_LEASE_MS = 60_000;
export const retryDelayMs = (attempt: number) =>
  Math.min(3600, 30 * 2 ** Math.min(attempt, 7)) * 1000;
