import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { ulid } from 'ulid';
import { DatabaseService } from '../../../database/database.service';
import {
  issues,
  issueStatuses,
  memberships,
  projectTeams,
  projects,
  teams,
  workspaces,
} from '../../../database/schema';
import { appendEventInTransaction } from '../../eventing/infrastructure/transactional-event-appender';
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
} from '../application/ports/projects-repository.port';
import { calculateProjectProgress } from '../domain/project';
import { canWriteWorkManagement } from '../domain/work-management-roles';

const first = <T>(values: T[]): T | null => values[0] ?? null;

const activeWorkspaceFilter = (workspaceId: string) =>
  and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt));

const activeProjectFilter = (projectId: string) =>
  and(eq(projects.id, projectId), isNull(projects.deletedAt));

@Injectable()
export class DrizzleProjectsRepository implements ProjectsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(input: ListProjectsInput): Promise<ProjectPage> {
    const cursorFilter =
      input.cursor === null
        ? undefined
        : or(
            lt(projects.createdAt, input.cursor.createdAt),
            and(
              eq(projects.createdAt, input.cursor.createdAt),
              lt(projects.id, input.cursor.id),
            ),
          );

    let teamFilter = undefined;
    if (input.teamId) {
      const projectIdsWithTeam = this.database.db
        .select({ projectId: projectTeams.projectId })
        .from(projectTeams)
        .where(eq(projectTeams.teamId, input.teamId));
      teamFilter = inArray(projects.id, projectIdsWithTeam);
    }

    const filters = and(
      eq(projects.workspaceId, input.workspaceId),
      isNull(projects.deletedAt),
      input.status === undefined
        ? undefined
        : eq(projects.status, input.status),
      input.leadId === undefined
        ? undefined
        : eq(projects.leadId, input.leadId),
      teamFilter,
    );

    const [rows, totals] = await Promise.all([
      this.database.db
        .select()
        .from(projects)
        .where(and(filters, cursorFilter))
        .orderBy(desc(projects.createdAt), desc(projects.id))
        .limit(input.limit + 1),
      this.database.db.select({ value: count() }).from(projects).where(filters),
    ]);

    const pageRows = rows.slice(0, input.limit);
    const items = await Promise.all(
      pageRows.map((p) => this.hydrateProjectDetails(p)),
    );

    return {
      items,
      hasNext: rows.length > input.limit,
      total: totals[0]?.value ?? 0,
    };
  }

  async findById(projectId: string): Promise<ProjectWithDetails | null> {
    const project = first(
      await this.database.db
        .select()
        .from(projects)
        .where(activeProjectFilter(projectId))
        .limit(1),
    );
    if (!project) {
      return null;
    }
    return this.hydrateProjectDetails(project);
  }

  async findAccess(
    projectId: string,
    userId: string,
  ): Promise<ProjectAccess | null> {
    return first(
      await this.database.db
        .select({ project: projects, role: memberships.role })
        .from(projects)
        .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
        .innerJoin(
          memberships,
          and(
            eq(memberships.workspaceId, projects.workspaceId),
            eq(memberships.userId, userId),
          ),
        )
        .where(
          and(
            eq(projects.id, projectId),
            isNull(projects.deletedAt),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1),
    );
  }

  async create(input: CreateProjectInput): Promise<CreateProjectResult> {
    return this.database.db.transaction(async (transaction) => {
      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(input.workspaceId))
          .for('update')
          .limit(1),
      );
      if (!workspace) {
        return { type: 'workspace_not_found' };
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, input.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (!actor || !canWriteWorkManagement(actor.role)) {
        return { type: 'forbidden' };
      }

      if (input.leadId) {
        const lead = first(
          await transaction
            .select({ id: memberships.id })
            .from(memberships)
            .where(
              and(
                eq(memberships.id, input.leadId),
                eq(memberships.workspaceId, input.workspaceId),
              ),
            )
            .limit(1),
        );
        if (!lead) {
          return {
            type: 'reference_not_found',
            reference: 'Workspace membership lead',
          };
        }
      }

      if (input.teamIds && input.teamIds.length > 0) {
        const activeTeams = await transaction
          .select({ id: teams.id })
          .from(teams)
          .where(
            and(
              eq(teams.workspaceId, input.workspaceId),
              inArray(teams.id, input.teamIds),
            ),
          );
        if (activeTeams.length !== input.teamIds.length) {
          return {
            type: 'reference_not_found',
            reference: 'Team association',
          };
        }
      }

      const projectId = `prj_${ulid()}`;
      const now = new Date();

      const created = first(
        await transaction
          .insert(projects)
          .values({
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
          })
          .returning(),
      );

      if (!created) {
        throw new Error('Failed to insert project');
      }

      if (input.teamIds && input.teamIds.length > 0) {
        await transaction.insert(projectTeams).values(
          input.teamIds.map((teamId) => ({
            id: `pjt_${ulid()}`,
            projectId: created.id,
            teamId,
            createdAt: now,
          })),
        );
      }

      await appendEventInTransaction(transaction, {
        workspaceId: input.workspaceId,
        eventType: 'project.created',
        payload: {
          projectId: created.id,
          name: created.name,
          status: created.status,
          actorUserId: input.actorUserId,
        },
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      });

      const details = await this.hydrateProjectDetails(created, transaction);
      return { type: 'created', project: details };
    });
  }

  async update(input: UpdateProjectInput): Promise<UpdateProjectResult> {
    return this.database.db.transaction(async (transaction) => {
      const current = first(
        await transaction
          .select()
          .from(projects)
          .where(activeProjectFilter(input.projectId))
          .for('update')
          .limit(1),
      );
      if (!current) {
        return { type: 'not_found' };
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, current.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (!actor || !canWriteWorkManagement(actor.role)) {
        return { type: 'forbidden' };
      }

      if (input.changes.leadId !== undefined && input.changes.leadId !== null) {
        const lead = first(
          await transaction
            .select({ id: memberships.id })
            .from(memberships)
            .where(
              and(
                eq(memberships.id, input.changes.leadId),
                eq(memberships.workspaceId, current.workspaceId),
              ),
            )
            .limit(1),
        );
        if (!lead) {
          return {
            type: 'reference_not_found',
            reference: 'Workspace membership lead',
          };
        }
      }

      const updated = first(
        await transaction
          .update(projects)
          .set({
            ...(input.changes.name === undefined
              ? {}
              : { name: input.changes.name }),
            ...(input.changes.summary === undefined
              ? {}
              : { summary: input.changes.summary }),
            ...(input.changes.description === undefined
              ? {}
              : { description: input.changes.description }),
            ...(input.changes.status === undefined
              ? {}
              : { status: input.changes.status }),
            ...(input.changes.priority === undefined
              ? {}
              : { priority: input.changes.priority }),
            ...(input.changes.leadId === undefined
              ? {}
              : { leadId: input.changes.leadId }),
            ...(input.changes.startDate === undefined
              ? {}
              : { startDate: input.changes.startDate }),
            ...(input.changes.targetDate === undefined
              ? {}
              : { targetDate: input.changes.targetDate }),
            updatedAt: input.updatedAt,
          })
          .where(activeProjectFilter(input.projectId))
          .returning(),
      );

      if (!updated) {
        return { type: 'not_found' };
      }

      let eventType:
        'project.updated' | 'project.completed' | 'project.canceled' =
        'project.updated';
      if (
        input.changes.status === 'COMPLETED' &&
        current.status !== 'COMPLETED'
      ) {
        eventType = 'project.completed';
      } else if (
        input.changes.status === 'CANCELED' &&
        current.status !== 'CANCELED'
      ) {
        eventType = 'project.canceled';
      }

      await appendEventInTransaction(transaction, {
        workspaceId: updated.workspaceId,
        eventType,
        payload: {
          projectId: updated.id,
          status: updated.status,
          previousStatus: current.status,
          actorUserId: input.actorUserId,
        },
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      });

      const details = await this.hydrateProjectDetails(updated, transaction);
      return {
        type: 'updated',
        project: details,
        previousStatus: current.status,
      };
    });
  }

  async delete(input: DeleteProjectInput): Promise<DeleteProjectResult> {
    return this.database.db.transaction(async (transaction) => {
      const current = first(
        await transaction
          .select({ workspaceId: projects.workspaceId })
          .from(projects)
          .where(activeProjectFilter(input.projectId))
          .limit(1),
      );
      if (!current) {
        return { type: 'not_found' };
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, current.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (!actor || !canWriteWorkManagement(actor.role)) {
        return { type: 'forbidden' };
      }

      const deleted = await transaction
        .update(projects)
        .set({ deletedAt: input.deletedAt, updatedAt: input.deletedAt })
        .where(activeProjectFilter(input.projectId))
        .returning({ id: projects.id });

      return deleted.length === 0 ? { type: 'not_found' } : { type: 'deleted' };
    });
  }

  async addTeam(input: AddProjectTeamInput): Promise<AddProjectTeamResult> {
    return this.database.db.transaction(async (transaction) => {
      const project = first(
        await transaction
          .select()
          .from(projects)
          .where(activeProjectFilter(input.projectId))
          .limit(1),
      );
      if (!project) {
        return { type: 'not_found' };
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, project.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (!actor || !canWriteWorkManagement(actor.role)) {
        return { type: 'forbidden' };
      }

      const team = first(
        await transaction
          .select({ id: teams.id })
          .from(teams)
          .where(
            and(
              eq(teams.id, input.teamId),
              eq(teams.workspaceId, project.workspaceId),
              isNull(teams.retiredAt),
            ),
          )
          .limit(1),
      );
      if (!team) {
        return { type: 'reference_not_found', reference: 'Active team' };
      }

      const existing = first(
        await transaction
          .select()
          .from(projectTeams)
          .where(
            and(
              eq(projectTeams.projectId, input.projectId),
              eq(projectTeams.teamId, input.teamId),
            ),
          )
          .limit(1),
      );
      if (existing) {
        return {
          type: 'conflict',
          message: 'Team is already associated with this project.',
        };
      }

      const inserted = first(
        await transaction
          .insert(projectTeams)
          .values({
            id: `pjt_${ulid()}`,
            projectId: input.projectId,
            teamId: input.teamId,
            createdAt: new Date(),
          })
          .returning(),
      );

      if (!inserted) {
        throw new Error('Failed to insert project team association');
      }

      return { type: 'added', association: inserted };
    });
  }

  async removeTeam(
    input: RemoveProjectTeamInput,
  ): Promise<RemoveProjectTeamResult> {
    return this.database.db.transaction(async (transaction) => {
      const project = first(
        await transaction
          .select()
          .from(projects)
          .where(activeProjectFilter(input.projectId))
          .limit(1),
      );
      if (!project) {
        return { type: 'not_found' };
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, project.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (!actor || !canWriteWorkManagement(actor.role)) {
        return { type: 'forbidden' };
      }

      const deleted = await transaction
        .delete(projectTeams)
        .where(
          and(
            eq(projectTeams.projectId, input.projectId),
            eq(projectTeams.teamId, input.teamId),
          ),
        )
        .returning({ id: projectTeams.id });

      return deleted.length === 0 ? { type: 'not_found' } : { type: 'removed' };
    });
  }

  private async hydrateProjectDetails(
    project: typeof projects.$inferSelect,
    tx = this.database.db,
  ): Promise<ProjectWithDetails> {
    const [teamRows, issueRows] = await Promise.all([
      tx
        .select({ team: teams })
        .from(projectTeams)
        .innerJoin(teams, eq(teams.id, projectTeams.teamId))
        .where(eq(projectTeams.projectId, project.id)),
      tx
        .select({
          statusCategory: issueStatuses.category,
        })
        .from(issues)
        .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
        .where(and(eq(issues.projectId, project.id), isNull(issues.deletedAt))),
    ]);

    const totalIssues = issueRows.length;
    const completedIssues = issueRows.filter(
      (i) => i.statusCategory === 'COMPLETED',
    ).length;

    return {
      ...project,
      teams: teamRows.map((r) => r.team),
      progress: calculateProjectProgress(totalIssues, completedIssues),
    };
  }
}
