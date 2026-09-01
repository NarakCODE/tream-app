import { ulid } from 'ulid';
import type {
  CreateIssueInput,
  CreateIssueResult,
  DeleteIssueInput,
  DeleteIssueResult,
  IssueAccess,
  IssuePage,
  IssuesRepository,
  IssueWithDetails,
  ListIssuesInput,
  UpdateIssueInput,
  UpdateIssueResult,
} from '../../src/modules/work-management/application/ports/issues-repository.port';
import type { Issue } from '../../src/modules/work-management/domain/issue';
import { canWriteWorkManagement } from '../../src/modules/work-management/domain/work-management-roles';
import type { InMemoryWorkspaceRepository } from './in-memory-workspace.repository';
import type { InMemoryTeamsRepository } from './in-memory-teams.repository';
import type { InMemoryProjectsRepository } from './in-memory-projects.repository';
import type { InMemoryCyclesRepository } from './in-memory-cycles.repository';

export class InMemoryIssuesRepository implements IssuesRepository {
  public readonly issues = new Map<string, Issue>();

  constructor(
    private readonly workspaceRepository: InMemoryWorkspaceRepository,
    private readonly teamsRepository: InMemoryTeamsRepository,
    private readonly projectsRepository: InMemoryProjectsRepository,
    private readonly cyclesRepository: InMemoryCyclesRepository,
  ) {}

  reset(): void {
    this.issues.clear();
  }

  async list(input: ListIssuesInput): Promise<IssuePage> {
    const all = [...this.issues.values()]
      .filter((i) => {
        if (i.workspaceId !== input.workspaceId || i.deletedAt !== null) {
          return false;
        }
        if (input.teamId !== undefined && i.teamId !== input.teamId) {
          return false;
        }
        if (input.projectId !== undefined && i.projectId !== input.projectId) {
          return false;
        }
        if (input.cycleId !== undefined && i.cycleId !== input.cycleId) {
          return false;
        }
        if (
          input.assigneeId !== undefined &&
          i.assigneeId !== input.assigneeId
        ) {
          return false;
        }
        if (input.priority !== undefined && i.priority !== input.priority) {
          return false;
        }
        if (input.statusId !== undefined && i.statusId !== input.statusId) {
          return false;
        }
        if (input.statusCategory !== undefined) {
          const status = this.teamsRepository.statuses.get(i.statusId);
          if (status?.category !== input.statusCategory) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const diff = b.createdAt.getTime() - a.createdAt.getTime();
        return diff !== 0 ? diff : b.id.localeCompare(a.id);
      });

    const afterCursor =
      input.cursor === null
        ? all
        : all.filter(
            (i) =>
              i.createdAt < input.cursor!.createdAt ||
              (i.createdAt.getTime() === input.cursor!.createdAt.getTime() &&
                i.id < input.cursor!.id),
          );

    const items = afterCursor
      .slice(0, input.limit)
      .map((i) => this.hydrateDetails(i));

    return Promise.resolve({
      items,
      hasNext: afterCursor.length > input.limit,
      total: all.length,
    });
  }

  findById(issueId: string): Promise<IssueWithDetails | null> {
    const issue = this.issues.get(issueId);
    if (!issue || issue.deletedAt !== null) return Promise.resolve(null);
    return Promise.resolve(this.hydrateDetails(issue));
  }

  async findAccess(
    issueId: string,
    userId: string,
  ): Promise<IssueAccess | null> {
    const issue = this.issues.get(issueId);
    if (!issue || issue.deletedAt !== null) return null;

    const access = await this.workspaceRepository.findActiveWorkspaceMembership(
      issue.workspaceId,
      userId,
    );
    if (!access) return null;

    return { issue, role: access.membership.role };
  }

  async create(input: CreateIssueInput): Promise<CreateIssueResult> {
    const access = await this.workspaceRepository.findActiveWorkspaceMembership(
      input.workspaceId,
      input.actorUserId,
    );
    if (!access) return { type: 'workspace_not_found' };
    if (!canWriteWorkManagement(access.membership.role)) {
      return { type: 'forbidden' };
    }

    const team = this.teamsRepository.teams.get(input.teamId);
    if (!team || team.workspaceId !== input.workspaceId) {
      return { type: 'forbidden' };
    }
    if (team.retiredAt !== null) {
      return { type: 'team_retired' };
    }

    let statusId = input.statusId;
    if (!statusId) {
      const defaultStatus = [...this.teamsRepository.statuses.values()].find(
        (s) => s.teamId === team.id && s.isDefault,
      );
      if (!defaultStatus) {
        throw new Error(`Team '${team.id}' has no default status.`);
      }
      statusId = defaultStatus.id;
    } else {
      const status = this.teamsRepository.statuses.get(statusId);
      if (!status || status.teamId !== team.id) {
        return {
          type: 'status_not_in_team',
          message: `Status does not belong to team '${team.name}'.`,
        };
      }
    }

    if (input.assigneeId) {
      const assignee = await this.workspaceRepository.findWorkspaceMember(
        input.workspaceId,
        input.assigneeId,
      );
      if (!assignee) {
        return {
          type: 'reference_not_found',
          reference: 'Workspace member assignee',
        };
      }
    }

    if (input.projectId) {
      const project = this.projectsRepository.projects.get(input.projectId);
      if (
        !project ||
        project.workspaceId !== input.workspaceId ||
        project.deletedAt !== null
      ) {
        return { type: 'reference_not_found', reference: 'Project' };
      }

      const hasTeam = [...this.projectsRepository.projectTeams.values()].some(
        (pt) => pt.projectId === input.projectId && pt.teamId === team.id,
      );
      if (!hasTeam) {
        return {
          type: 'project_not_linked_to_team',
          message: `Team '${team.name}' is not associated with this project.`,
        };
      }
    }

    if (input.cycleId) {
      const cycle = this.cyclesRepository.cycles.get(input.cycleId);
      if (!cycle || cycle.teamId !== team.id) {
        return {
          type: 'cycle_not_in_team',
          message: `Cycle does not belong to team '${team.name}'.`,
        };
      }
    }

    const issueNumber = team.nextIssueNumber;
    const identifier = `${team.key}-${issueNumber}`;
    team.nextIssueNumber += 1;

    const issueId = `iss_${ulid()}`;
    const now = new Date();
    const issue: Issue = {
      id: issueId,
      workspaceId: input.workspaceId,
      teamId: team.id,
      number: issueNumber,
      identifier,
      title: input.title,
      description: input.description ?? null,
      statusId,
      priority: input.priority ?? 'NO_PRIORITY',
      assigneeId: input.assigneeId ?? null,
      projectId: input.projectId ?? null,
      cycleId: input.cycleId ?? null,
      dueDate: input.dueDate ?? null,
      estimate: input.estimate ?? null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.issues.set(issue.id, issue);

    const details = this.hydrateDetails(issue);
    return { type: 'created', issue: details };
  }

  async update(input: UpdateIssueInput): Promise<UpdateIssueResult> {
    const access = await this.findAccess(input.issueId, input.actorUserId);
    if (!access) return { type: 'not_found' };
    if (!canWriteWorkManagement(access.role)) return { type: 'forbidden' };

    const team = this.teamsRepository.teams.get(access.issue.teamId);
    if (!team) return { type: 'forbidden' };
    if (team.retiredAt !== null) return { type: 'team_retired' };

    if (
      input.changes.statusId &&
      input.changes.statusId !== access.issue.statusId
    ) {
      const status = this.teamsRepository.statuses.get(input.changes.statusId);
      if (!status || status.teamId !== team.id) {
        return {
          type: 'status_not_in_team',
          message: `Status does not belong to team '${team.name}'.`,
        };
      }
    }

    if (
      input.changes.assigneeId !== undefined &&
      input.changes.assigneeId !== null &&
      input.changes.assigneeId !== access.issue.assigneeId
    ) {
      const assignee = await this.workspaceRepository.findWorkspaceMember(
        access.issue.workspaceId,
        input.changes.assigneeId,
      );
      if (!assignee) {
        return {
          type: 'reference_not_found',
          reference: 'Workspace member assignee',
        };
      }
    }

    if (
      input.changes.projectId !== undefined &&
      input.changes.projectId !== null &&
      input.changes.projectId !== access.issue.projectId
    ) {
      const project = this.projectsRepository.projects.get(
        input.changes.projectId,
      );
      if (
        !project ||
        project.workspaceId !== access.issue.workspaceId ||
        project.deletedAt !== null
      ) {
        return { type: 'reference_not_found', reference: 'Project' };
      }

      const hasTeam = [...this.projectsRepository.projectTeams.values()].some(
        (pt) =>
          pt.projectId === input.changes.projectId && pt.teamId === team.id,
      );
      if (!hasTeam) {
        return {
          type: 'project_not_linked_to_team',
          message: `Team '${team.name}' is not associated with this project.`,
        };
      }
    }

    if (
      input.changes.cycleId !== undefined &&
      input.changes.cycleId !== null &&
      input.changes.cycleId !== access.issue.cycleId
    ) {
      const cycle = this.cyclesRepository.cycles.get(input.changes.cycleId);
      if (!cycle || cycle.teamId !== team.id) {
        return {
          type: 'cycle_not_in_team',
          message: `Cycle does not belong to team '${team.name}'.`,
        };
      }
    }

    const previousStatusId = access.issue.statusId;
    const previousAssigneeId = access.issue.assigneeId;

    const updated: Issue = {
      ...access.issue,
      ...(input.changes.title !== undefined
        ? { title: input.changes.title }
        : {}),
      ...(input.changes.description !== undefined
        ? { description: input.changes.description }
        : {}),
      ...(input.changes.statusId !== undefined
        ? { statusId: input.changes.statusId }
        : {}),
      ...(input.changes.priority !== undefined
        ? { priority: input.changes.priority }
        : {}),
      ...(input.changes.assigneeId !== undefined
        ? { assigneeId: input.changes.assigneeId }
        : {}),
      ...(input.changes.projectId !== undefined
        ? { projectId: input.changes.projectId }
        : {}),
      ...(input.changes.cycleId !== undefined
        ? { cycleId: input.changes.cycleId }
        : {}),
      ...(input.changes.dueDate !== undefined
        ? { dueDate: input.changes.dueDate }
        : {}),
      ...(input.changes.estimate !== undefined
        ? { estimate: input.changes.estimate }
        : {}),
      updatedAt: input.updatedAt,
    };
    this.issues.set(updated.id, updated);

    const details = this.hydrateDetails(updated);
    return {
      type: 'updated',
      issue: details,
      previousStatusId,
      previousAssigneeId,
    };
  }

  async delete(input: DeleteIssueInput): Promise<DeleteIssueResult> {
    const access = await this.findAccess(input.issueId, input.actorUserId);
    if (!access) return { type: 'not_found' };
    if (!canWriteWorkManagement(access.role)) return { type: 'forbidden' };

    const updated: Issue = {
      ...access.issue,
      deletedAt: input.deletedAt,
      updatedAt: input.deletedAt,
    };
    this.issues.set(updated.id, updated);
    return { type: 'deleted', issue: updated };
  }

  private hydrateDetails(issue: Issue): IssueWithDetails {
    const team = this.teamsRepository.teams.get(issue.teamId);
    const status = this.teamsRepository.statuses.get(issue.statusId);
    const project = issue.projectId
      ? (this.projectsRepository.projects.get(issue.projectId) ?? null)
      : null;
    const cycle = issue.cycleId
      ? (this.cyclesRepository.cycles.get(issue.cycleId) ?? null)
      : null;

    if (!team || !status) {
      throw new Error(`Integrity error for issue ${issue.id}`);
    }

    return {
      ...issue,
      team,
      status,
      project,
      cycle,
    };
  }
}
