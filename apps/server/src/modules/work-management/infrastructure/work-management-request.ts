import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import type { TeamAccess } from '../application/ports/teams-repository.port';
import type { ProjectAccess } from '../application/ports/projects-repository.port';
import type { IssueAccess } from '../application/ports/issues-repository.port';
import type { CycleAccess } from '../application/ports/cycles-repository.port';

export interface TeamRequest {
  params: { teamId?: string };
  user?: AuthenticatedUser;
  teamAccess?: TeamAccess;
}

export interface ProjectRequest {
  params: { projectId?: string };
  user?: AuthenticatedUser;
  projectAccess?: ProjectAccess;
}

export interface IssueRequest {
  params: { issueId?: string };
  user?: AuthenticatedUser;
  issueAccess?: IssueAccess;
}

export interface CycleRequest {
  params: { cycleId?: string };
  user?: AuthenticatedUser;
  cycleAccess?: CycleAccess;
}
