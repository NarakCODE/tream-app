import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import type { DealAccess } from '../application/ports/deals-repository.port';

export interface DealRequest {
  params: { dealId?: string };
  user?: AuthenticatedUser;
  dealAccess?: DealAccess;
}
