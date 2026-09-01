import type { CursorTuple } from '../../../../common/pagination/cursor';
import type { WorkspaceRole } from '../../../iam/domain/workspace-membership';
import type {
  Project,
  ProjectProgress,
  ProjectStatus,
  ProjectTeam,
  WorkPriority,
} from '../../domain/project';
import type { Team } from '../../domain/team';

export const PROJECTS_REPOSITORY = Symbol('PROJECTS_REPOSITORY');

export interface ProjectWithDetails extends Project {
  teams: Team[];
  progress: ProjectProgress;
}

export interface ProjectPage {
  items: ProjectWithDetails[];
  hasNext: boolean;
  total: number;
}

export interface ListProjectsInput {
  workspaceId: string;
  cursor: CursorTuple | null;
  limit: number;
  status?: ProjectStatus | undefined;
  teamId?: string | undefined;
  leadId?: string | undefined;
}

export interface ProjectAccess {
  project: Project;
  role: WorkspaceRole;
}

export interface CreateProjectInput {
  workspaceId: string;
  actorUserId: string;
  name: string;
  summary?: string | null | undefined;
  description?: string | null | undefined;
  status?: ProjectStatus | undefined;
  priority?: WorkPriority | undefined;
  leadId?: string | null | undefined;
  startDate?: Date | null | undefined;
  targetDate?: Date | null | undefined;
  teamIds?: string[] | undefined;
  idempotencyKey?: string | null | undefined;
}

export type CreateProjectResult =
  | { type: 'created'; project: ProjectWithDetails }
  | { type: 'invalid_dates'; message: string }
  | { type: 'reference_not_found'; reference: string }
  | { type: 'forbidden' }
  | { type: 'workspace_not_found' };

export interface UpdateProjectInput {
  projectId: string;
  actorUserId: string;
  changes: {
    name?: string | undefined;
    summary?: string | null | undefined;
    description?: string | null | undefined;
    status?: ProjectStatus | undefined;
    priority?: WorkPriority | undefined;
    leadId?: string | null | undefined;
    startDate?: Date | null | undefined;
    targetDate?: Date | null | undefined;
  };
  updatedAt: Date;
  idempotencyKey?: string | null | undefined;
}

export type UpdateProjectResult =
  | {
      type: 'updated';
      project: ProjectWithDetails;
      previousStatus: ProjectStatus;
    }
  | { type: 'unchanged'; project: ProjectWithDetails }
  | { type: 'invalid_dates'; message: string }
  | { type: 'reference_not_found'; reference: string }
  | { type: 'forbidden' }
  | { type: 'not_found' };

export interface DeleteProjectInput {
  projectId: string;
  actorUserId: string;
  deletedAt: Date;
  idempotencyKey?: string | null | undefined;
}

export type DeleteProjectResult =
  { type: 'deleted' } | { type: 'forbidden' } | { type: 'not_found' };

export interface AddProjectTeamInput {
  projectId: string;
  actorUserId: string;
  teamId: string;
  idempotencyKey?: string | null | undefined;
}

export type AddProjectTeamResult =
  | { type: 'added'; association: ProjectTeam }
  | { type: 'conflict'; message: string }
  | { type: 'reference_not_found'; reference: string }
  | { type: 'forbidden' }
  | { type: 'not_found' };

export interface RemoveProjectTeamInput {
  projectId: string;
  actorUserId: string;
  teamId: string;
  idempotencyKey?: string | null | undefined;
}

export type RemoveProjectTeamResult =
  { type: 'removed' } | { type: 'forbidden' } | { type: 'not_found' };

export interface ProjectsRepository {
  list(input: ListProjectsInput): Promise<ProjectPage>;
  findById(projectId: string): Promise<ProjectWithDetails | null>;
  findAccess(projectId: string, userId: string): Promise<ProjectAccess | null>;
  create(input: CreateProjectInput): Promise<CreateProjectResult>;
  update(input: UpdateProjectInput): Promise<UpdateProjectResult>;
  delete(input: DeleteProjectInput): Promise<DeleteProjectResult>;
  addTeam(input: AddProjectTeamInput): Promise<AddProjectTeamResult>;
  removeTeam(input: RemoveProjectTeamInput): Promise<RemoveProjectTeamResult>;
}
