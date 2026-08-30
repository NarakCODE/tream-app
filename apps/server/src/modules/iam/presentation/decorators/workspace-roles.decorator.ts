import { SetMetadata } from '@nestjs/common';
import type { WorkspaceRole } from '../../domain/workspace-membership';

export const WORKSPACE_ROLES_KEY = 'workspace_roles';

export const WorkspaceRoles = (...roles: WorkspaceRole[]) =>
  SetMetadata(WORKSPACE_ROLES_KEY, roles);
