import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import type { ContactAccess } from '../application/ports/contacts-repository.port';

export interface ContactRequest {
  params: { contactId?: string };
  user?: AuthenticatedUser;
  contactAccess?: ContactAccess;
}
