import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { ulid } from 'ulid';
import { DatabaseService } from '../../../database/database.service';
import {
  cycles,
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
} from '../application/ports/issues-repository.port';
import { canWriteWorkManagement } from '../domain/work-management-roles';

const first = <T>(values: T[]): T | null => values[0] ?? null;

const activeWorkspaceFilter = (workspaceId: string) =>
  and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt));

const activeIssueFilter = (issueId: string) =>
  and(eq(issues.id, issueId), isNull(issues.deletedAt));

@Injectable()
export class DrizzleIssuesRepository implements IssuesRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(input: ListIssuesInput): Promise<IssuePage> {
    const cursorFilter =
      input.cursor === null
        ? undefined
        : or(
            lt(issues.createdAt, input.cursor.createdAt),
            and(
              eq(issues.createdAt, input.cursor.createdAt),
              lt(issues.id, input.cursor.id),
            ),
          );

    const filters = and(
      eq(issues.workspaceId, input.workspaceId),
      isNull(issues.deletedAt),
      input.teamId === undefined ? undefined : eq(issues.teamId, input.teamId),
      input.projectId === undefined
        ? undefined
        : eq(issues.projectId, input.projectId),
      input.cycleId === undefined
        ? undefined
        : eq(issues.cycleId, input.cycleId),
      input.assigneeId === undefined
        ? undefined
        : eq(issues.assigneeId, input.assigneeId),
      input.priority === undefined
        ? undefined
        : eq(issues.priority, input.priority),
      input.statusId === undefined
        ? undefined
        : eq(issues.statusId, input.statusId),
      input.statusCategory === undefined
        ? undefined
        : eq(issueStatuses.category, input.statusCategory),
    );

    const [rows, totals] = await Promise.all([
      this.database.db
        .select({
          issue: issues,
          team: teams,
          status: issueStatuses,
          project: projects,
          cycle: cycles,
        })
        .from(issues)
        .innerJoin(teams, eq(teams.id, issues.teamId))
        .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
        .leftJoin(projects, eq(projects.id, issues.projectId))
        .leftJoin(cycles, eq(cycles.id, issues.cycleId))
        .where(and(filters, cursorFilter))
        .orderBy(desc(issues.createdAt), desc(issues.id))
        .limit(input.limit + 1),
      this.database.db
        .select({ value: count() })
        .from(issues)
        .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
        .where(filters),
    ]);

    const items: IssueWithDetails[] = rows.slice(0, input.limit).map((r) => ({
      ...r.issue,
      team: r.team,
      status: r.status,
      project: r.project,
      cycle: r.cycle,
    }));

    return {
      items,
      hasNext: rows.length > input.limit,
      total: totals[0]?.value ?? 0,
    };
  }

  async findById(issueId: string): Promise<IssueWithDetails | null> {
    const row = first(
      await this.database.db
        .select({
          issue: issues,
          team: teams,
          status: issueStatuses,
          project: projects,
          cycle: cycles,
        })
        .from(issues)
        .innerJoin(teams, eq(teams.id, issues.teamId))
        .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
        .leftJoin(projects, eq(projects.id, issues.projectId))
        .leftJoin(cycles, eq(cycles.id, issues.cycleId))
        .where(activeIssueFilter(issueId))
        .limit(1),
    );

    if (!row) {
      return null;
    }

    return {
      ...row.issue,
      team: row.team,
      status: row.status,
      project: row.project,
      cycle: row.cycle,
    };
  }

  async findAccess(
    issueId: string,
    userId: string,
  ): Promise<IssueAccess | null> {
    return first(
      await this.database.db
        .select({ issue: issues, role: memberships.role })
        .from(issues)
        .innerJoin(workspaces, eq(workspaces.id, issues.workspaceId))
        .innerJoin(
          memberships,
          and(
            eq(memberships.workspaceId, issues.workspaceId),
            eq(memberships.userId, userId),
          ),
        )
        .where(
          and(
            eq(issues.id, issueId),
            isNull(issues.deletedAt),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1),
    );
  }

  async create(input: CreateIssueInput): Promise<CreateIssueResult> {
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

      const team = first(
        await transaction
          .select()
          .from(teams)
          .where(
            and(
              eq(teams.id, input.teamId),
              eq(teams.workspaceId, input.workspaceId),
            ),
          )
          .for('update')
          .limit(1),
      );
      if (!team) {
        return { type: 'forbidden' };
      }
      if (team.retiredAt !== null) {
        return { type: 'team_retired' };
      }

      let statusId = input.statusId;
      if (!statusId) {
        const defaultStatus = first(
          await transaction
            .select({ id: issueStatuses.id })
            .from(issueStatuses)
            .where(
              and(
                eq(issueStatuses.teamId, team.id),
                eq(issueStatuses.isDefault, true),
              ),
            )
            .limit(1),
        );
        if (!defaultStatus) {
          throw new Error(`Team '${team.id}' has no default status.`);
        }
        statusId = defaultStatus.id;
      } else {
        const status = first(
          await transaction
            .select({ id: issueStatuses.id })
            .from(issueStatuses)
            .where(
              and(
                eq(issueStatuses.id, statusId),
                eq(issueStatuses.teamId, team.id),
              ),
            )
            .limit(1),
        );
        if (!status) {
          return {
            type: 'status_not_in_team',
            message: `Status does not belong to team '${team.name}'.`,
          };
        }
      }

      if (input.assigneeId) {
        const assignee = first(
          await transaction
            .select({ id: memberships.id })
            .from(memberships)
            .where(
              and(
                eq(memberships.id, input.assigneeId),
                eq(memberships.workspaceId, input.workspaceId),
              ),
            )
            .limit(1),
        );
        if (!assignee) {
          return {
            type: 'reference_not_found',
            reference: 'Workspace member assignee',
          };
        }
      }

      if (input.projectId) {
        const project = first(
          await transaction
            .select({ id: projects.id })
            .from(projects)
            .where(
              and(
                eq(projects.id, input.projectId),
                eq(projects.workspaceId, input.workspaceId),
                isNull(projects.deletedAt),
              ),
            )
            .limit(1),
        );
        if (!project) {
          return {
            type: 'reference_not_found',
            reference: 'Project',
          };
        }

        const projectTeam = first(
          await transaction
            .select()
            .from(projectTeams)
            .where(
              and(
                eq(projectTeams.projectId, input.projectId),
                eq(projectTeams.teamId, team.id),
              ),
            )
            .limit(1),
        );
        if (!projectTeam) {
          return {
            type: 'project_not_linked_to_team',
            message: `Team '${team.name}' is not associated with this project.`,
          };
        }
      }

      if (input.cycleId) {
        const cycle = first(
          await transaction
            .select({ id: cycles.id })
            .from(cycles)
            .where(
              and(eq(cycles.id, input.cycleId), eq(cycles.teamId, team.id)),
            )
            .limit(1),
        );
        if (!cycle) {
          return {
            type: 'cycle_not_in_team',
            message: `Cycle does not belong to team '${team.name}'.`,
          };
        }
      }

      const issueNumber = team.nextIssueNumber;
      const identifier = `${team.key}-${issueNumber}`;
      const issueId = `iss_${ulid()}`;
      const now = new Date();

      await transaction
        .update(teams)
        .set({ nextIssueNumber: issueNumber + 1 })
        .where(eq(teams.id, team.id));

      const created = first(
        await transaction
          .insert(issues)
          .values({
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
          })
          .returning(),
      );

      if (!created) {
        throw new Error('Failed to insert issue');
      }

      await appendEventInTransaction(transaction, {
        workspaceId: input.workspaceId,
        eventType: 'issue.created',
        payload: {
          issueId: created.id,
          teamId: created.teamId,
          identifier: created.identifier,
          title: created.title,
          statusId: created.statusId,
          actorUserId: input.actorUserId,
        },
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      });

      if (created.assigneeId) {
        await appendEventInTransaction(transaction, {
          workspaceId: input.workspaceId,
          eventType: 'issue.assigned',
          payload: {
            issueId: created.id,
            assigneeId: created.assigneeId,
            actorUserId: input.actorUserId,
          },
        });
      }

      const details = await this.hydrateIssueDetails(created, transaction);
      return { type: 'created', issue: details };
    });
  }

  async update(input: UpdateIssueInput): Promise<UpdateIssueResult> {
    return this.database.db.transaction(async (transaction) => {
      const current = first(
        await transaction
          .select()
          .from(issues)
          .where(activeIssueFilter(input.issueId))
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

      const team = first(
        await transaction
          .select()
          .from(teams)
          .where(eq(teams.id, current.teamId))
          .limit(1),
      );
      if (!team) {
        return { type: 'forbidden' };
      }
      if (team.retiredAt !== null) {
        return { type: 'team_retired' };
      }

      if (
        input.changes.statusId &&
        input.changes.statusId !== current.statusId
      ) {
        const status = first(
          await transaction
            .select({ id: issueStatuses.id })
            .from(issueStatuses)
            .where(
              and(
                eq(issueStatuses.id, input.changes.statusId),
                eq(issueStatuses.teamId, current.teamId),
              ),
            )
            .limit(1),
        );
        if (!status) {
          return {
            type: 'status_not_in_team',
            message: `Status does not belong to team '${team.name}'.`,
          };
        }
      }

      if (
        input.changes.assigneeId !== undefined &&
        input.changes.assigneeId !== null &&
        input.changes.assigneeId !== current.assigneeId
      ) {
        const assignee = first(
          await transaction
            .select({ id: memberships.id })
            .from(memberships)
            .where(
              and(
                eq(memberships.id, input.changes.assigneeId),
                eq(memberships.workspaceId, current.workspaceId),
              ),
            )
            .limit(1),
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
        input.changes.projectId !== current.projectId
      ) {
        const project = first(
          await transaction
            .select({ id: projects.id })
            .from(projects)
            .where(
              and(
                eq(projects.id, input.changes.projectId),
                eq(projects.workspaceId, current.workspaceId),
                isNull(projects.deletedAt),
              ),
            )
            .limit(1),
        );
        if (!project) {
          return {
            type: 'reference_not_found',
            reference: 'Project',
          };
        }

        const projectTeam = first(
          await transaction
            .select()
            .from(projectTeams)
            .where(
              and(
                eq(projectTeams.projectId, input.changes.projectId),
                eq(projectTeams.teamId, current.teamId),
              ),
            )
            .limit(1),
        );
        if (!projectTeam) {
          return {
            type: 'project_not_linked_to_team',
            message: `Team '${team.name}' is not associated with this project.`,
          };
        }
      }

      if (
        input.changes.cycleId !== undefined &&
        input.changes.cycleId !== null &&
        input.changes.cycleId !== current.cycleId
      ) {
        const cycle = first(
          await transaction
            .select({ id: cycles.id })
            .from(cycles)
            .where(
              and(
                eq(cycles.id, input.changes.cycleId),
                eq(cycles.teamId, current.teamId),
              ),
            )
            .limit(1),
        );
        if (!cycle) {
          return {
            type: 'cycle_not_in_team',
            message: `Cycle does not belong to team '${team.name}'.`,
          };
        }
      }

      const updated = first(
        await transaction
          .update(issues)
          .set({
            ...(input.changes.title === undefined
              ? {}
              : { title: input.changes.title }),
            ...(input.changes.description === undefined
              ? {}
              : { description: input.changes.description }),
            ...(input.changes.statusId === undefined
              ? {}
              : { statusId: input.changes.statusId }),
            ...(input.changes.priority === undefined
              ? {}
              : { priority: input.changes.priority }),
            ...(input.changes.assigneeId === undefined
              ? {}
              : { assigneeId: input.changes.assigneeId }),
            ...(input.changes.projectId === undefined
              ? {}
              : { projectId: input.changes.projectId }),
            ...(input.changes.cycleId === undefined
              ? {}
              : { cycleId: input.changes.cycleId }),
            ...(input.changes.dueDate === undefined
              ? {}
              : { dueDate: input.changes.dueDate }),
            ...(input.changes.estimate === undefined
              ? {}
              : { estimate: input.changes.estimate }),
            updatedAt: input.updatedAt,
          })
          .where(activeIssueFilter(input.issueId))
          .returning(),
      );

      if (!updated) {
        return { type: 'not_found' };
      }

      await appendEventInTransaction(transaction, {
        workspaceId: updated.workspaceId,
        eventType: 'issue.updated',
        payload: {
          issueId: updated.id,
          actorUserId: input.actorUserId,
        },
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      });

      if (
        input.changes.statusId &&
        input.changes.statusId !== current.statusId
      ) {
        await appendEventInTransaction(transaction, {
          workspaceId: updated.workspaceId,
          eventType: 'issue.status_changed',
          payload: {
            issueId: updated.id,
            previousStatusId: current.statusId,
            statusId: updated.statusId,
            actorUserId: input.actorUserId,
          },
        });
      }

      if (
        input.changes.assigneeId !== undefined &&
        input.changes.assigneeId !== current.assigneeId
      ) {
        await appendEventInTransaction(transaction, {
          workspaceId: updated.workspaceId,
          eventType: 'issue.assigned',
          payload: {
            issueId: updated.id,
            previousAssigneeId: current.assigneeId,
            assigneeId: updated.assigneeId,
            actorUserId: input.actorUserId,
          },
        });
      }

      const details = await this.hydrateIssueDetails(updated, transaction);
      return {
        type: 'updated',
        issue: details,
        previousStatusId: current.statusId,
        previousAssigneeId: current.assigneeId,
      };
    });
  }

  async delete(input: DeleteIssueInput): Promise<DeleteIssueResult> {
    return this.database.db.transaction(async (transaction) => {
      const current = first(
        await transaction
          .select()
          .from(issues)
          .where(activeIssueFilter(input.issueId))
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

      const deleted = first(
        await transaction
          .update(issues)
          .set({ deletedAt: input.deletedAt, updatedAt: input.deletedAt })
          .where(activeIssueFilter(input.issueId))
          .returning(),
      );

      if (!deleted) {
        return { type: 'not_found' };
      }

      await appendEventInTransaction(transaction, {
        workspaceId: deleted.workspaceId,
        eventType: 'issue.deleted',
        payload: {
          issueId: deleted.id,
          actorUserId: input.actorUserId,
        },
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      });

      return { type: 'deleted', issue: deleted };
    });
  }

  private async hydrateIssueDetails(
    issue: typeof issues.$inferSelect,
    tx = this.database.db,
  ): Promise<IssueWithDetails> {
    const [teamRows, statusRows, projectRows, cycleRows] = await Promise.all([
      tx.select().from(teams).where(eq(teams.id, issue.teamId)).limit(1),
      tx
        .select()
        .from(issueStatuses)
        .where(eq(issueStatuses.id, issue.statusId))
        .limit(1),
      issue.projectId
        ? tx
            .select()
            .from(projects)
            .where(eq(projects.id, issue.projectId))
            .limit(1)
        : Promise.resolve([]),
      issue.cycleId
        ? tx.select().from(cycles).where(eq(cycles.id, issue.cycleId)).limit(1)
        : Promise.resolve([]),
    ]);

    const team = first(teamRows);
    const status = first(statusRows);
    const project = first(projectRows);
    const cycle = first(cycleRows);

    if (!team || !status) {
      throw new Error(`Integrity error for issue '${issue.id}'`);
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
