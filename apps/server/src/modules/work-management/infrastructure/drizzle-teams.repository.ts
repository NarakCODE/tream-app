import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { ulid } from 'ulid';
import { DatabaseService } from '../../../database/database.service';
import {
  cycles,
  issueStatuses,
  memberships,
  teamMemberships,
  teams,
  users,
  workspaces,
} from '../../../database/schema';
import { appendEventInTransaction } from '../../eventing/infrastructure/transactional-event-appender';
import type {
  AddTeamMemberInput,
  AddTeamMemberResult,
  CreateTeamInput,
  CreateTeamResult,
  ListTeamsInput,
  RemoveTeamMemberInput,
  RemoveTeamMemberResult,
  RestoreTeamInput,
  RestoreTeamResult,
  RetireTeamInput,
  RetireTeamResult,
  TeamAccess,
  TeamPage,
  TeamsRepository,
  UpdateCycleSettingsInput,
  UpdateCycleSettingsResult,
  UpdateTeamInput,
  UpdateTeamResult,
} from '../application/ports/teams-repository.port';
import { calculateNextCycles } from '../domain/cycle-calculator';
import {
  DEFAULT_TEAM_STATUSES,
  type Team,
  type TeamMemberDetails,
} from '../domain/team';
import type { IssueStatus } from '../domain/issue';
import {
  canAdministerWorkManagement,
  canJoinTeam,
} from '../domain/work-management-roles';

const first = <T>(values: T[]): T | null => values[0] ?? null;

const activeWorkspaceFilter = (workspaceId: string) =>
  and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt));

@Injectable()
export class DrizzleTeamsRepository implements TeamsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(input: ListTeamsInput): Promise<TeamPage> {
    const cursorFilter =
      input.cursor === null
        ? undefined
        : or(
            lt(teams.createdAt, input.cursor.createdAt),
            and(
              eq(teams.createdAt, input.cursor.createdAt),
              lt(teams.id, input.cursor.id),
            ),
          );

    const filters = and(
      eq(teams.workspaceId, input.workspaceId),
      input.includeRetired ? undefined : isNull(teams.retiredAt),
    );

    const [rows, totals] = await Promise.all([
      this.database.db
        .select()
        .from(teams)
        .where(and(filters, cursorFilter))
        .orderBy(desc(teams.createdAt), desc(teams.id))
        .limit(input.limit + 1),
      this.database.db.select({ value: count() }).from(teams).where(filters),
    ]);

    return {
      items: rows.slice(0, input.limit),
      hasNext: rows.length > input.limit,
      total: totals[0]?.value ?? 0,
    };
  }

  async findById(teamId: string): Promise<Team | null> {
    return first(
      await this.database.db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1),
    );
  }

  async findAccess(teamId: string, userId: string): Promise<TeamAccess | null> {
    const row = first(
      await this.database.db
        .select({
          team: teams,
          role: memberships.role,
          membershipId: memberships.id,
        })
        .from(teams)
        .innerJoin(workspaces, eq(workspaces.id, teams.workspaceId))
        .innerJoin(
          memberships,
          and(
            eq(memberships.workspaceId, teams.workspaceId),
            eq(memberships.userId, userId),
          ),
        )
        .where(and(eq(teams.id, teamId), isNull(workspaces.deletedAt)))
        .limit(1),
    );

    if (!row) {
      return null;
    }

    const teamMember = first(
      await this.database.db
        .select({ id: teamMemberships.id })
        .from(teamMemberships)
        .where(
          and(
            eq(teamMemberships.teamId, teamId),
            eq(teamMemberships.membershipId, row.membershipId),
          ),
        )
        .limit(1),
    );

    return {
      team: row.team,
      role: row.role,
      isTeamMember: teamMember !== null,
    };
  }

  async create(input: CreateTeamInput): Promise<CreateTeamResult> {
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
          .select({ role: memberships.role, membershipId: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, input.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (!actor || !canAdministerWorkManagement(actor.role)) {
        return { type: 'forbidden' };
      }

      const existingKey = first(
        await transaction
          .select({ id: teams.id })
          .from(teams)
          .where(
            and(
              eq(teams.workspaceId, input.workspaceId),
              eq(teams.key, input.key),
              isNull(teams.retiredAt),
            ),
          )
          .limit(1),
      );
      if (existingKey) {
        return {
          type: 'conflict',
          message: `A team with key '${input.key}' already exists in this workspace.`,
        };
      }

      const teamId = `tem_${ulid()}`;
      const now = new Date();

      const createdTeam = first(
        await transaction
          .insert(teams)
          .values({
            id: teamId,
            workspaceId: input.workspaceId,
            name: input.name,
            key: input.key,
            description: input.description ?? null,
            timezone: input.timezone ?? 'UTC',
            cycleDurationWeeks: input.cycleDurationWeeks ?? 2,
            cycleStartDay: input.cycleStartDay ?? 1,
            cycleCooldownDays: input.cycleCooldownDays ?? 0,
            upcomingCyclesCount: input.upcomingCyclesCount ?? 3,
            cyclesEnabled: input.cyclesEnabled ?? false,
            nextIssueNumber: 1,
            createdAt: now,
            updatedAt: now,
          })
          .returning(),
      );

      if (!createdTeam) {
        throw new Error('Failed to insert team.');
      }

      await transaction.insert(teamMemberships).values({
        id: `tmb_${ulid()}`,
        teamId: createdTeam.id,
        membershipId: actor.membershipId,
        createdAt: now,
        updatedAt: now,
      });

      const statusRows = DEFAULT_TEAM_STATUSES.map((status) => ({
        id: `ist_${ulid()}`,
        teamId: createdTeam.id,
        name: status.name,
        category: status.category,
        position: status.position,
        isDefault: status.isDefault,
        createdAt: now,
        updatedAt: now,
      }));

      const defaultStatuses = await transaction
        .insert(issueStatuses)
        .values(statusRows)
        .returning();

      if (createdTeam.cyclesEnabled) {
        const drafts = calculateNextCycles(createdTeam, [], now);
        if (drafts.length > 0) {
          await transaction.insert(cycles).values(
            drafts.map((d) => ({
              id: `cyc_${ulid()}`,
              teamId: createdTeam.id,
              number: d.number,
              name: d.name,
              startsAt: d.startsAt,
              endsAt: d.endsAt,
              createdAt: now,
              updatedAt: now,
            })),
          );
        }
      }

      await appendEventInTransaction(transaction, {
        workspaceId: input.workspaceId,
        eventType: 'team.created',
        payload: {
          teamId: createdTeam.id,
          name: createdTeam.name,
          key: createdTeam.key,
          actorUserId: input.actorUserId,
        },
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      });

      return {
        type: 'created',
        team: createdTeam,
        defaultStatuses,
      };
    });
  }

  async update(input: UpdateTeamInput): Promise<UpdateTeamResult> {
    return this.database.db.transaction(async (transaction) => {
      const current = first(
        await transaction
          .select()
          .from(teams)
          .where(eq(teams.id, input.teamId))
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
      if (!actor || !canAdministerWorkManagement(actor.role)) {
        return { type: 'forbidden' };
      }

      if (input.changes.key && input.changes.key !== current.key) {
        const existingKey = first(
          await transaction
            .select({ id: teams.id })
            .from(teams)
            .where(
              and(
                eq(teams.workspaceId, current.workspaceId),
                eq(teams.key, input.changes.key),
                isNull(teams.retiredAt),
              ),
            )
            .limit(1),
        );
        if (existingKey) {
          return {
            type: 'conflict',
            message: `A team with key '${input.changes.key}' already exists in this workspace.`,
          };
        }
      }

      const updated = first(
        await transaction
          .update(teams)
          .set({
            ...(input.changes.name === undefined
              ? {}
              : { name: input.changes.name }),
            ...(input.changes.key === undefined
              ? {}
              : { key: input.changes.key }),
            ...(input.changes.description === undefined
              ? {}
              : { description: input.changes.description }),
            ...(input.changes.timezone === undefined
              ? {}
              : { timezone: input.changes.timezone }),
            updatedAt: input.updatedAt,
          })
          .where(eq(teams.id, input.teamId))
          .returning(),
      );

      if (!updated) {
        return { type: 'not_found' };
      }

      await appendEventInTransaction(transaction, {
        workspaceId: updated.workspaceId,
        eventType: 'team.updated',
        payload: {
          teamId: updated.id,
          changes: input.changes,
          actorUserId: input.actorUserId,
        },
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      });

      return { type: 'updated', team: updated };
    });
  }

  async retire(input: RetireTeamInput): Promise<RetireTeamResult> {
    return this.database.db.transaction(async (transaction) => {
      const current = first(
        await transaction
          .select()
          .from(teams)
          .where(eq(teams.id, input.teamId))
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
      if (!actor || !canAdministerWorkManagement(actor.role)) {
        return { type: 'forbidden' };
      }

      const updated = first(
        await transaction
          .update(teams)
          .set({
            retiredAt: input.retiredAt,
            updatedAt: input.retiredAt,
          })
          .where(eq(teams.id, input.teamId))
          .returning(),
      );

      if (!updated) {
        return { type: 'not_found' };
      }

      await appendEventInTransaction(transaction, {
        workspaceId: updated.workspaceId,
        eventType: 'team.retired',
        payload: {
          teamId: updated.id,
          actorUserId: input.actorUserId,
        },
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      });

      return { type: 'retired', team: updated };
    });
  }

  async restore(input: RestoreTeamInput): Promise<RestoreTeamResult> {
    return this.database.db.transaction(async (transaction) => {
      const current = first(
        await transaction
          .select()
          .from(teams)
          .where(eq(teams.id, input.teamId))
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
      if (!actor || !canAdministerWorkManagement(actor.role)) {
        return { type: 'forbidden' };
      }

      const existingKey = first(
        await transaction
          .select({ id: teams.id })
          .from(teams)
          .where(
            and(
              eq(teams.workspaceId, current.workspaceId),
              eq(teams.key, current.key),
              isNull(teams.retiredAt),
            ),
          )
          .limit(1),
      );
      if (existingKey) {
        return {
          type: 'conflict',
          message: `Another active team in this workspace is using key '${current.key}'.`,
        };
      }

      const now = new Date();
      const updated = first(
        await transaction
          .update(teams)
          .set({
            retiredAt: null,
            updatedAt: now,
          })
          .where(eq(teams.id, input.teamId))
          .returning(),
      );

      if (!updated) {
        return { type: 'not_found' };
      }

      await appendEventInTransaction(transaction, {
        workspaceId: updated.workspaceId,
        eventType: 'team.updated',
        payload: {
          teamId: updated.id,
          action: 'restored',
          actorUserId: input.actorUserId,
        },
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      });

      return { type: 'restored', team: updated };
    });
  }

  async listMembers(teamId: string): Promise<TeamMemberDetails[]> {
    const rows = await this.database.db
      .select({
        id: teamMemberships.id,
        teamId: teamMemberships.teamId,
        membershipId: teamMemberships.membershipId,
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        role: memberships.role,
        createdAt: teamMemberships.createdAt,
      })
      .from(teamMemberships)
      .innerJoin(memberships, eq(memberships.id, teamMemberships.membershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(teamMemberships.teamId, teamId))
      .orderBy(asc(teamMemberships.createdAt));

    return rows;
  }

  async addMember(input: AddTeamMemberInput): Promise<AddTeamMemberResult> {
    return this.database.db.transaction(async (transaction) => {
      const team = first(
        await transaction
          .select()
          .from(teams)
          .where(eq(teams.id, input.teamId))
          .limit(1),
      );
      if (!team) {
        return { type: 'not_found' };
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role, membershipId: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, team.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (!actor || !canJoinTeam(actor.role)) {
        return { type: 'forbidden' };
      }

      const targetMember = first(
        await transaction
          .select({ id: memberships.id, role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.id, input.membershipId),
              eq(memberships.workspaceId, team.workspaceId),
            ),
          )
          .limit(1),
      );
      if (!targetMember || targetMember.role === 'GUEST') {
        return { type: 'reference_not_found' };
      }

      const existing = first(
        await transaction
          .select()
          .from(teamMemberships)
          .where(
            and(
              eq(teamMemberships.teamId, input.teamId),
              eq(teamMemberships.membershipId, input.membershipId),
            ),
          )
          .limit(1),
      );
      if (existing) {
        return { type: 'already_member', membership: existing };
      }

      const now = new Date();
      const inserted = first(
        await transaction
          .insert(teamMemberships)
          .values({
            id: `tmb_${ulid()}`,
            teamId: input.teamId,
            membershipId: input.membershipId,
            createdAt: now,
            updatedAt: now,
          })
          .returning(),
      );

      if (!inserted) {
        throw new Error('Failed to insert team membership');
      }

      return { type: 'added', membership: inserted };
    });
  }

  async removeMember(
    input: RemoveTeamMemberInput,
  ): Promise<RemoveTeamMemberResult> {
    return this.database.db.transaction(async (transaction) => {
      const team = first(
        await transaction
          .select()
          .from(teams)
          .where(eq(teams.id, input.teamId))
          .limit(1),
      );
      if (!team) {
        return { type: 'not_found' };
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role, membershipId: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, team.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (!actor) {
        return { type: 'forbidden' };
      }

      const canRemove =
        canAdministerWorkManagement(actor.role) ||
        actor.membershipId === input.membershipId;

      if (!canRemove) {
        return { type: 'forbidden' };
      }

      const deleted = await transaction
        .delete(teamMemberships)
        .where(
          and(
            eq(teamMemberships.teamId, input.teamId),
            eq(teamMemberships.membershipId, input.membershipId),
          ),
        )
        .returning({ id: teamMemberships.id });

      return deleted.length === 0 ? { type: 'not_found' } : { type: 'removed' };
    });
  }

  async listStatuses(teamId: string): Promise<IssueStatus[]> {
    return this.database.db
      .select()
      .from(issueStatuses)
      .where(eq(issueStatuses.teamId, teamId))
      .orderBy(asc(issueStatuses.position));
  }

  async updateCycleSettings(
    input: UpdateCycleSettingsInput,
  ): Promise<UpdateCycleSettingsResult> {
    return this.database.db.transaction(async (transaction) => {
      const current = first(
        await transaction
          .select()
          .from(teams)
          .where(eq(teams.id, input.teamId))
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
      if (!actor || !canAdministerWorkManagement(actor.role)) {
        return { type: 'forbidden' };
      }

      const updated = first(
        await transaction
          .update(teams)
          .set({
            ...(input.settings.cyclesEnabled === undefined
              ? {}
              : { cyclesEnabled: input.settings.cyclesEnabled }),
            ...(input.settings.cycleDurationWeeks === undefined
              ? {}
              : { cycleDurationWeeks: input.settings.cycleDurationWeeks }),
            ...(input.settings.cycleStartDay === undefined
              ? {}
              : { cycleStartDay: input.settings.cycleStartDay }),
            ...(input.settings.cycleCooldownDays === undefined
              ? {}
              : { cycleCooldownDays: input.settings.cycleCooldownDays }),
            ...(input.settings.upcomingCyclesCount === undefined
              ? {}
              : { upcomingCyclesCount: input.settings.upcomingCyclesCount }),
            ...(input.settings.timezone === undefined
              ? {}
              : { timezone: input.settings.timezone }),
            updatedAt: input.updatedAt,
          })
          .where(eq(teams.id, input.teamId))
          .returning(),
      );

      if (!updated) {
        return { type: 'not_found' };
      }

      if (updated.cyclesEnabled) {
        const existing = await transaction
          .select()
          .from(cycles)
          .where(eq(cycles.teamId, updated.id));
        const drafts = calculateNextCycles(updated, existing, input.updatedAt);
        if (drafts.length > 0) {
          await transaction.insert(cycles).values(
            drafts.map((d) => ({
              id: `cyc_${ulid()}`,
              teamId: updated.id,
              number: d.number,
              name: d.name,
              startsAt: d.startsAt,
              endsAt: d.endsAt,
              createdAt: input.updatedAt,
              updatedAt: input.updatedAt,
            })),
          );
        }
      }

      return { type: 'updated', team: updated };
    });
  }
}
