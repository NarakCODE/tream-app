import type { AuthenticatedUser } from '../domain/auth-user';
import type { WorkspaceMembershipAccess } from '../domain/workspace-membership';

export interface WorkspaceRequest {
  params: { workspaceId?: string };
  user?: AuthenticatedUser;
  workspaceAccess?: WorkspaceMembershipAccess;
}
