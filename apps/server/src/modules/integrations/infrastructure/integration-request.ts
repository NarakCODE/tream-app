import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import type { IntegrationAccess } from '../application/ports/integrations-repository.port';

export interface IntegrationRequest {
  params: { integrationId?: string };
  user?: AuthenticatedUser;
  integrationAccess?: IntegrationAccess;
}
