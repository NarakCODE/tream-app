import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import type { EventAccess } from '../application/ports/event-store.port';

export interface EventRequest {
  params: { eventId?: string };
  user?: AuthenticatedUser;
  eventAccess?: EventAccess;
}
