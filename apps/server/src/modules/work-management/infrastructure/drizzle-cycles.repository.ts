import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { ulid } from 'ulid';
import { DatabaseService } from '../../../database/database.service';
import {
  cycles,
  issues,
  issueStatuses,
  memberships,
  teams,
  workspaces,
} from '../../../database/schema';
import { appendEventInTransaction } from '../../eventing/infrastructure/transactional-event-appender';
import type {
  CompleteCycleInput,
  CompleteCycleResult,
  CycleAccess,
  CyclesRepository,
  CycleWithDetails,
  UpdateCycleInput,
  UpdateCycleResult,
} from '../application/ports/cycles-repository.port';
import { calculateNextCycles } from '../domain/cycle-calculator';
import { calculateCycleProgress, type Cycle } from '../domain/cycle';
import { shouldRollOverToNextCycle } from '../domain/issue';
import { canWriteWorkManagement } from '../domain/work-management-roles';

const first = <T>(values: T[]): T | null => values[0] ?? null;

@Injectable()
export class DrizzleCyclesRepository implements CyclesRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(teamId: string): Promise<CycleWithDetails[]> {
    const rows = await this.database.db
      .select()
      .from(cycles)
      .where(eq(cycles.teamId, teamId))
      .orderBy(asc(cycles.number));

    return Promise.all(rows.map((c) => this.hydrateCycleDetails(c)));
  }

  async findById(cycleId: string): Promise<CycleWithDetails | null> {
    const cycle = first(
      await this.database.db
        .select()
        .from(cycles)
        .where(eq(cycles.id, cycleId))
        .limit(1),
    );
    if (!cycle) {
      return null;
    }
    return this.hydrateCycleDetails(cycle);
  }

  async findAccess(
    cycleId: string,
    userId: string,
  ): Promise<CycleAccess | null> {
    return first(
      await this.database.db
        .select({ cycle: cycles, role: memberships.role })
        .from(cycles)
        .innerJoin(teams, eq(teams.id, cycles.teamId))
        .innerJoin(workspaces, eq(workspaces.id, teams.workspaceId))
        .innerJoin(
          memberships,
          and(
            eq(memberships.workspaceId, teams.workspaceId),
            eq(memberships.userId, userId),
          ),
        )
        .where(and(eq(cycles.id, cycleId), isNull(workspaces.deletedAt)))
        .limit(1),
    );
  }

  async update(input: UpdateCycleInput): Promise<UpdateCycleResult> {
    return this.database.db.transaction(async (transaction) => {
      const current = first(
        await transaction
          .select()
          .from(cycles)
          .where(eq(cycles.id, input.cycleId))
          .for('update')
          .limit(1),
      );
      if (!current) {
        return { type: 'not_found' };
      }

      const team = first(
        await transaction
          .select()
          .from(teams)
          .where(eq(teams.id, current.teamId))
          .limit(1),
      );
      if (!team) {
        return { type: 'not_found' };
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, team.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (!actor || !canWriteWorkManagement(actor.role)) {
        return { type: 'forbidden' };
      }

      const updated = first(
        await transaction
          .update(cycles)
          .set({
            ...(input.changes.name === undefined
              ? {}
              : { name: input.changes.name }),
            updatedAt: input.updatedAt,
          })
          .where(eq(cycles.id, input.cycleId))
          .returning(),
      );

      if (!updated) {
        return { type: 'not_found' };
      }

      const details = await this.hydrateCycleDetails(updated, transaction);
      return { type: 'updated', cycle: details };
    });
  }

  async complete(input: CompleteCycleInput): Promise<CompleteCycleResult> {
    return this.database.db.transaction(async (transaction) => {
      const current = first(
        await transaction
          .select()
          .from(cycles)
          .where(eq(cycles.id, input.cycleId))
          .for('update')
          .limit(1),
      );
      if (!current) {
        return { type: 'not_found' };
      }

      const team = first(
        await transaction
          .select()
          .from(teams)
          .where(eq(teams.id, current.teamId))
          .for('update')
          .limit(1),
      );
      if (!team) {
        return { type: 'not_found' };
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, team.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (!actor || !canWriteWorkManagement(actor.role)) {
        return { type: 'forbidden' };
      }

      if (current.completedAt !== null) {
        const details = await this.hydrateCycleDetails(current, transaction);
        return { type: 'already_completed', cycle: details };
      }

      const updated = first(
        await transaction
          .update(cycles)
          .set({
            completedAt: input.completedAt,
            updatedAt: input.completedAt,
          })
          .where(eq(cycles.id, input.cycleId))
          .returning(),
      );

      if (!updated) {
        throw new Error('Failed to complete cycle');
      }

      const allCycles = await transaction
        .select()
        .from(cycles)
        .where(eq(cycles.teamId, team.id))
        .orderBy(asc(cycles.number));

      let nextCycle = allCycles.find(
        (c) => c.number > current.number && c.completedAt === null,
      );

      if (!nextCycle && team.cyclesEnabled) {
        const drafts = calculateNextCycles(team, allCycles, input.completedAt);
        if (drafts.length > 0) {
          const insertedDrafts = await transaction
            .insert(cycles)
            .values(
              drafts.map((d) => ({
                id: `cyc_${ulid()}`,
                teamId: team.id,
                number: d.number,
                name: d.name,
                startsAt: d.startsAt,
                endsAt: d.endsAt,
                createdAt: input.completedAt,
                updatedAt: input.completedAt,
              })),
            )
            .returning();
          nextCycle = insertedDrafts[0];
        }
      }

      const cycleIssues = await transaction
        .select({
          issue: issues,
          statusCategory: issueStatuses.category,
        })
        .from(issues)
        .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
        .where(and(eq(issues.cycleId, current.id), isNull(issues.deletedAt)));

      let rolledOverCount = 0;
      if (nextCycle) {
        const rollOverIds = cycleIssues
          .filter((i) => shouldRollOverToNextCycle(i.statusCategory))
          .map((i) => i.issue.id);

        if (rollOverIds.length > 0) {
          await transaction
            .update(issues)
            .set({
              cycleId: nextCycle.id,
              updatedAt: input.completedAt,
            })
            .where(inArray(issues.id, rollOverIds));
          rolledOverCount = rollOverIds.length;
        }
      }

      await appendEventInTransaction(transaction, {
        workspaceId: team.workspaceId,
        eventType: 'cycle.completed',
        payload: {
          cycleId: updated.id,
          teamId: updated.teamId,
          rolledOverCount,
          nextCycleId: nextCycle ? nextCycle.id : null,
          actorUserId: input.actorUserId,
        },
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      });

      const details = await this.hydrateCycleDetails(updated, transaction);
      return {
        type: 'completed',
        cycle: details,
        rolledOverCount,
        nextCycleId: nextCycle ? nextCycle.id : null,
      };
    });
  }

  async syncUpcomingCycles(
    teamId: string,
    referenceDate: Date = new Date(),
  ): Promise<Cycle[]> {
    return this.database.db.transaction(async (transaction) => {
      const team = first(
        await transaction
          .select()
          .from(teams)
          .where(eq(teams.id, teamId))
          .for('update')
          .limit(1),
      );
      if (!team || !team.cyclesEnabled) {
        return [];
      }

      const existing = await transaction
        .select()
        .from(cycles)
        .where(eq(cycles.teamId, team.id))
        .orderBy(asc(cycles.number));

      const drafts = calculateNextCycles(team, existing, referenceDate);
      if (drafts.length === 0) {
        return existing;
      }

      const inserted = await transaction
        .insert(cycles)
        .values(
          drafts.map((d) => ({
            id: `cyc_${ulid()}`,
            teamId: team.id,
            number: d.number,
            name: d.name,
            startsAt: d.startsAt,
            endsAt: d.endsAt,
            createdAt: referenceDate,
            updatedAt: referenceDate,
          })),
        )
        .returning();

      return [...existing, ...inserted];
    });
  }

  private async hydrateCycleDetails(
    cycle: typeof cycles.$inferSelect,
    tx = this.database.db,
  ): Promise<CycleWithDetails> {
    const issueRows = await tx
      .select({
        statusCategory: issueStatuses.category,
      })
      .from(issues)
      .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
      .where(and(eq(issues.cycleId, cycle.id), isNull(issues.deletedAt)));

    const totalIssues = issueRows.length;
    const completedIssues = issueRows.filter(
      (i) => i.statusCategory === 'COMPLETED',
    ).length;

    return {
      ...cycle,
      progress: calculateCycleProgress(totalIssues, completedIssues),
    };
  }
}
