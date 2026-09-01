import type { CursorTuple } from '../../../../common/pagination/cursor';
import type { WorkspaceRole } from '../../../iam/domain/workspace-membership';
import type {
  Issue,
  IssueStatus,
  IssueStatusCategory,
} from '../../domain/issue';
import type { Project, WorkPriority } from '../../domain/project';
import type { Team } from '../../domain/team';
import type { Cycle } from '../../domain/cycle';

export const ISSUES_REPOSITORY = Symbol('ISSUES_REPOSITORY');

export interface IssueWithDetails extends Issue {
  team: Team;
  status: IssueStatus;
  project: Project | null;
  cycle: Cycle | null;
}

export interface IssuePage {
  items: IssueWithDetails[];
  hasNext: boolean;
  total: number;
}

export interface ListIssuesInput {
  workspaceId: string;
  cursor: CursorTuple | null;
  limit: number;
  teamId?: string | undefined;
  projectId?: string | undefined;
  cycleId?: string | undefined;
  assigneeId?: string | undefined;
  priority?: WorkPriority | undefined;
  statusCategory?: IssueStatusCategory | undefined;
  statusId?: string | undefined;
}

export interface IssueAccess {
  issue: Issue;
  role: WorkspaceRole;
}

export interface CreateIssueInput {
  workspaceId: string;
  teamId: string;
  actorUserId: string;
  title: string;
  description?: string | null | undefined;
  statusId?: string | undefined;
  priority?: WorkPriority | undefined;
  assigneeId?: string | null | undefined;
  projectId?: string | null | undefined;
  cycleId?: string | null | undefined;
  dueDate?: Date | null | undefined;
  estimate?: number | null | undefined;
  idempotencyKey?: string | null | undefined;
}

export type CreateIssueResult =
  | { type: 'created'; issue: IssueWithDetails }
  | { type: 'team_retired' }
  | { type: 'status_not_in_team'; message: string }
  | { type: 'project_not_linked_to_team'; message: string }
  | { type: 'cycle_not_in_team'; message: string }
  | { type: 'reference_not_found'; reference: string }
  | { type: 'forbidden' }
  | { type: 'workspace_not_found' };

export interface UpdateIssueInput {
  issueId: string;
  actorUserId: string;
  changes: {
    title?: string | undefined;
    description?: string | null | undefined;
    statusId?: string | undefined;
    priority?: WorkPriority | undefined;
    assigneeId?: string | null | undefined;
    projectId?: string | null | undefined;
    cycleId?: string | null | undefined;
    dueDate?: Date | null | undefined;
    estimate?: number | null | undefined;
  };
  updatedAt: Date;
  idempotencyKey?: string | null | undefined;
}

export type UpdateIssueResult =
  | {
      type: 'updated';
      issue: IssueWithDetails;
      previousStatusId: string;
      previousAssigneeId: string | null;
    }
  | { type: 'unchanged'; issue: IssueWithDetails }
  | { type: 'team_retired' }
  | { type: 'status_not_in_team'; message: string }
  | { type: 'project_not_linked_to_team'; message: string }
  | { type: 'cycle_not_in_team'; message: string }
  | { type: 'reference_not_found'; reference: string }
  | { type: 'forbidden' }
  | { type: 'not_found' };

export interface DeleteIssueInput {
  issueId: string;
  actorUserId: string;
  deletedAt: Date;
  idempotencyKey?: string | null | undefined;
}

export type DeleteIssueResult =
  | { type: 'deleted'; issue: Issue }
  | { type: 'forbidden' }
  | { type: 'not_found' };

export interface IssuesRepository {
  list(input: ListIssuesInput): Promise<IssuePage>;
  findById(issueId: string): Promise<IssueWithDetails | null>;
  findAccess(issueId: string, userId: string): Promise<IssueAccess | null>;
  create(input: CreateIssueInput): Promise<CreateIssueResult>;
  update(input: UpdateIssueInput): Promise<UpdateIssueResult>;
  delete(input: DeleteIssueInput): Promise<DeleteIssueResult>;
}
