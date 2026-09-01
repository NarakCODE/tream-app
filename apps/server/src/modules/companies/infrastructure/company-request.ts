import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import type { CompanyAccess } from '../application/ports/companies-repository.port';

export interface CompanyRequest {
  params: { companyId?: string };
  user?: AuthenticatedUser;
  companyAccess?: CompanyAccess;
}
