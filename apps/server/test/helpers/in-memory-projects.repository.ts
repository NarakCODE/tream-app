import { ulid } from 'ulid';
import type {
  AddProjectTeamInput,
  AddProjectTeamResult,
  CreateProjectInput,
  CreateProjectResult,
  DeleteProjectInput,
  DeleteProjectResult,
  ListProjectsInput,
  ProjectAccess,
  ProjectPage,
  ProjectsRepository,
  ProjectWithDetails,
  RemoveProjectTeamInput,
  RemoveProjectTeamResult,
  UpdateProjectInput,
  UpdateProjectResult,
} from '../../src/modules/work-management/application/ports/projects-repository.port';
import {
  calculateProjectProgress,
  type Project,
  type ProjectTeam,
} from '../../src/modules/work-management/domain/project';
import { canWriteWorkManagement } from '../../src/modules/work-management/domain/work-management-roles';
import type { InMemoryWorkspaceRepository } from './in-memory-workspace.repository';
import type { InMemoryTeamsRepository } from './in-memory-teams.repository';
import type { InMemoryIssuesRepository } from './in-memory-issues.repository';

export class InMemoryProjectsRepository implements ProjectsRepository {
  public readonly projects = new Map<string, Project>();
  public readonly projectTeams = new Map<string, ProjectTeam>();
  private issuesRepository?: InMemoryIssuesRepository;

  constructor(
    private readonly workspaceRepository: InMemoryWorkspaceRepository,
    private readonly teamsRepository: InMemoryTeamsRepository,
  ) {}

  setIssuesRepository(repo: InMemoryIssuesRepository): void {
    this.issuesRepository = repo;
  }

  reset(): void {
    this.projects.clear();
    this.projectTeams.clear();
  }

  list(input: ListProjectsInput): Promise<ProjectPage> {
    const all = [...this.projects.values()]
      .filter((p) => {
        if (p.workspaceId !== input.workspaceId || p.deletedAt !== null) {
          return false;
        }
        if (input.status !== undefined && p.status !== input.status) {
          return false;
        }
        if (input.leadId !== undefined && p.leadId !== input.leadId) {
          return false;
        }
        if (input.teamId !== undefined) {
          const hasTeam = [...this.projectTeams.values()].some(
            (pt) => pt.projectId === p.id && pt.teamId === input.teamId,
          );
          if (!hasTeam) return false;
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
            (p) =>
              p.createdAt < input.cursor!.createdAt ||
              (p.createdAt.getTime() === input.cursor!.createdAt.getTime() &&
                p.id < input.cursor!.id),
          );

    const items = afterCursor
      .slice(0, input.limit)
      .map((p) => this.hydrateDetails(p));

    return Promise.resolve({
      items,
      hasNext: afterCursor.length > input.limit,
      total: all.length,
    });
  }

  findById(projectId: string): Promise<ProjectWithDetails | null> {
    const project = this.projects.get(projectId);
    if (!project || project.deletedAt !== null) return Promise.resolve(null);
    return Promise.resolve(this.hydrateDetails(project));
  }

  async findAccess(
    projectId: string,
    userId: string,
  ): Promise<ProjectAccess | null> {
    const project = this.projects.get(projectId);
    if (!project || project.deletedAt !== null) return null;

    const access = await this.workspaceRepository.findActiveWorkspaceMembership(
      project.workspaceId,
      userId,
    );
    if (!access) return null;

    return { project, role: access.membership.role };
  }

  async create(input: CreateProjectInput): Promise<CreateProjectResult> {
    const access = await this.workspaceRepository.findActiveWorkspaceMembership(
      input.workspaceId,
      input.actorUserId,
    );
    if (!access) return { type: 'workspace_not_found' };
    if (!canWriteWorkManagement(access.membership.role)) {
      return { type: 'forbidden' };
    }

    if (input.leadId) {
      const lead = await this.workspaceRepository.findWorkspaceMember(
        input.workspaceId,
        input.leadId,
      );
      if (!lead) {
        return {
          type: 'reference_not_found',
          reference: 'Workspace membership lead',
        };
      }
    }

    if (input.teamIds && input.teamIds.length > 0) {
      for (const teamId of input.teamIds) {
        const team = this.teamsRepository.teams.get(teamId);
        if (!team || team.workspaceId !== input.workspaceId) {
          return {
            type: 'reference_not_found',
            reference: 'Team association',
          };
        }
      }
    }

    const projectId = `prj_${ulid()}`;
    const now = new Date();
    const project: Project = {
      id: projectId,
      workspaceId: input.workspaceId,
      name: input.name,
      summary: input.summary ?? null,
      description: input.description ?? null,
      status: input.status ?? 'PLANNED',
      priority: input.priority ?? 'NO_PRIORITY',
      leadId: input.leadId ?? null,
      startDate: input.startDate ?? null,
      targetDate: input.targetDate ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.projects.set(project.id, project);

    if (input.teamIds && input.teamIds.length > 0) {
      for (const teamId of input.teamIds) {
        const pt: ProjectTeam = {
          id: `pjt_${ulid()}`,
          projectId: project.id,
          teamId,
          createdAt: now,
        };
        this.projectTeams.set(pt.id, pt);
      }
    }

    const details = this.hydrateDetails(project);
    return { type: 'created', project: details };
  }

  async update(input: UpdateProjectInput): Promise<UpdateProjectResult> {
    const access = await this.findAccess(input.projectId, input.actorUserId);
    if (!access) return { type: 'not_found' };
    if (!canWriteWorkManagement(access.role)) return { type: 'forbidden' };

    if (input.changes.leadId !== undefined && input.changes.leadId !== null) {
      const lead = await this.workspaceRepository.findWorkspaceMember(
        access.project.workspaceId,
        input.changes.leadId,
      );
      if (!lead) {
        return {
          type: 'reference_not_found',
          reference: 'Workspace membership lead',
        };
      }
    }

    const previousStatus = access.project.status;
    const updated: Project = {
      ...access.project,
      ...(input.changes.name !== undefined ? { name: input.changes.name } : {}),
      ...(input.changes.summary !== undefined
        ? { summary: input.changes.summary }
        : {}),
      ...(input.changes.description !== undefined
        ? { description: input.changes.description }
        : {}),
      ...(input.changes.status !== undefined
        ? { status: input.changes.status }
        : {}),
      ...(input.changes.priority !== undefined
        ? { priority: input.changes.priority }
        : {}),
      ...(input.changes.leadId !== undefined
        ? { leadId: input.changes.leadId }
        : {}),
      ...(input.changes.startDate !== undefined
        ? { startDate: input.changes.startDate }
        : {}),
      ...(input.changes.targetDate !== undefined
        ? { targetDate: input.changes.targetDate }
        : {}),
      updatedAt: input.updatedAt,
    };
    this.projects.set(updated.id, updated);

    const details = this.hydrateDetails(updated);
    return { type: 'updated', project: details, previousStatus };
  }

  async delete(input: DeleteProjectInput): Promise<DeleteProjectResult> {
    const access = await this.findAccess(input.projectId, input.actorUserId);
    if (!access) return { type: 'not_found' };
    if (!canWriteWorkManagement(access.role)) return { type: 'forbidden' };

    const updated: Project = {
      ...access.project,
      deletedAt: input.deletedAt,
      updatedAt: input.deletedAt,
    };
    this.projects.set(updated.id, updated);
    return { type: 'deleted' };
  }

  async addTeam(input: AddProjectTeamInput): Promise<AddProjectTeamResult> {
    const access = await this.findAccess(input.projectId, input.actorUserId);
    if (!access) return { type: 'not_found' };
    if (!canWriteWorkManagement(access.role)) return { type: 'forbidden' };

    const team = this.teamsRepository.teams.get(input.teamId);
    if (
      !team ||
      team.workspaceId !== access.project.workspaceId ||
      team.retiredAt !== null
    ) {
      return { type: 'reference_not_found', reference: 'Active team' };
    }

    const existing = [...this.projectTeams.values()].find(
      (pt) => pt.projectId === input.projectId && pt.teamId === input.teamId,
    );
    if (existing) {
      return {
        type: 'conflict',
        message: 'Team is already associated with this project.',
      };
    }

    const association: ProjectTeam = {
      id: `pjt_${ulid()}`,
      projectId: input.projectId,
      teamId: input.teamId,
      createdAt: new Date(),
    };
    this.projectTeams.set(association.id, association);
    return { type: 'added', association };
  }

  async removeTeam(
    input: RemoveProjectTeamInput,
  ): Promise<RemoveProjectTeamResult> {
    const access = await this.findAccess(input.projectId, input.actorUserId);
    if (!access) return { type: 'not_found' };
    if (!canWriteWorkManagement(access.role)) return { type: 'forbidden' };

    const existing = [...this.projectTeams.values()].find(
      (pt) => pt.projectId === input.projectId && pt.teamId === input.teamId,
    );
    if (!existing) return { type: 'not_found' };

    this.projectTeams.delete(existing.id);
    return { type: 'removed' };
  }

  private hydrateDetails(project: Project): ProjectWithDetails {
    const teamAssociations = [...this.projectTeams.values()].filter(
      (pt) => pt.projectId === project.id,
    );
    const associatedTeams = teamAssociations
      .map((pt) => this.teamsRepository.teams.get(pt.teamId))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);

    let totalIssues = 0;
    let completedIssues = 0;
    if (this.issuesRepository) {
      const issues = [...this.issuesRepository.issues.values()].filter(
        (i) => i.projectId === project.id && i.deletedAt === null,
      );
      totalIssues = issues.length;
      completedIssues = issues.filter((i) => {
        const s = this.teamsRepository.statuses.get(i.statusId);
        return s?.category === 'COMPLETED';
      }).length;
    }

    return {
      ...project,
      teams: associatedTeams,
      progress: calculateProjectProgress(totalIssues, completedIssues),
    };
  }
}
