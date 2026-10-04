import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import {
  cycles,
  cycleRollovers,
  teams,
  workspaces,
} from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import { TeamAccessService } from '../../teams/application/team-access.service';
import { EventWriter } from '../../eventing/application/event-writer.service';
import { AuditWriter } from '../../audit/application/audit-writer.service';
import { IssueMutationService } from '../../issues/application/issue-mutation.service';
import {
  CycleRepository,
  type Cycle,
} from '../infrastructure/cycle.repository';
import {
  CyclePlanningError,
  localMidnight,
  nextWindow,
  requireRevision,
  validateWindow,
} from '../domain/cycle-planning';
import type {
  CompleteCycleDto,
  CreateCycleDto,
  ScheduleCyclesDto,
  UpdateCycleDto,
} from '../presentation/cycle.dto';
type Team = typeof teams.$inferSelect;
@Injectable()
export class CycleService {
  private readonly logger = new Logger(CycleService.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly repository: CycleRepository,
    private readonly access: TeamAccessService,
    private readonly commands: CommandBus,
    private readonly events: EventWriter,
    private readonly audit: AuditWriter,
    private readonly mutations: IssueMutationService,
  ) {}
  list(
    userId: string,
    workspaceId: string,
    teamId: string,
    limit: number,
    cursor?: string,
  ) {
    return this.db.db.transaction(async (tx) => {
      await this.access.require(
        tx,
        userId,
        workspaceId,
        teamId,
        'read',
        false,
        true,
      );
      const { rows, total } = await this.repository.list(
        tx,
        workspaceId,
        teamId,
        limit + 1,
        cursor ? decodeCursor(cursor) : undefined,
      );
      const items = rows.slice(0, limit);
      return {
        paginationType: 'cursor',
        cursor: cursor ?? null,
        limit,
        total,
        hasNext: rows.length > limit,
        items,
        nextCursor: rows.length > limit ? encodeCursor(items.at(-1)!) : null,
      };
    });
  }
  get(userId: string, workspaceId: string, teamId: string, cycleId: string) {
    return this.db.db.transaction(async (tx) => {
      await this.access.require(
        tx,
        userId,
        workspaceId,
        teamId,
        'read',
        false,
        true,
      );
      return this.cycle(tx, workspaceId, teamId, cycleId);
    });
  }
  report(userId: string, workspaceId: string, teamId: string, cycleId: string) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.access.require(
        tx,
        userId,
        workspaceId,
        teamId,
        'read',
        false,
        true,
      );
      const cycle = await this.cycle(tx, workspaceId, teamId, cycleId);
      return {
        cycle,
        ...(await this.repository.report(
          tx,
          cycle,
          member.id,
          member.role === 'GUEST',
        )),
      };
    });
  }
  create(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    dto: CreateCycleDto,
  ) {
    return this.execute(
      identity,
      workspaceId,
      teamId,
      async (tx, actorId, team) => {
        if (!dto.name.trim())
          throw new BadRequestException('Cycle name cannot be blank.');
        const bounds = this.bounds(dto, team.timezone);
        if (!bounds)
          throw new BadRequestException(
            'Supply either UTC bounds or local startDate/endDate.',
          );
        return this.insert(tx, team, dto.name.trim(), bounds, actorId);
      },
      201,
    );
  }
  schedule(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    dto: ScheduleCyclesDto,
  ) {
    return this.execute(
      identity,
      workspaceId,
      teamId,
      async (tx, actorId, team) => {
        if (!team.cyclesEnabled)
          throw new ConflictException('Enable cycles in team settings first.');
        const last = await this.repository.last(tx, teamId);
        const anchor = dto.anchorDate
          ? localMidnight(dto.anchorDate, team.timezone)
          : new Date();
        let after = last && last.endsAt > anchor ? last.endsAt : anchor;
        const created: Cycle[] = [];
        for (let n = 0; n < (dto.count ?? team.upcomingCyclesCount); n++) {
          const bounds = nextWindow(after, team);
          const cycle = await this.insert(
            tx,
            team,
            `Cycle ${await this.repository.nextNumber(tx, teamId)}`,
            bounds,
            actorId,
          );
          created.push(cycle);
          after = cycle.endsAt;
        }
        return created;
      },
      201,
    );
  }
  update(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    cycleId: string,
    dto: UpdateCycleDto,
  ) {
    return this.execute(
      identity,
      workspaceId,
      teamId,
      async (tx, actorId, team) => {
        const cycle = await this.cycle(tx, workspaceId, teamId, cycleId, true);
        this.mutable(cycle);
        requireRevision(cycle.revision, dto.expectedRevision);
        if (dto.name !== undefined && !dto.name.trim())
          throw new BadRequestException('Cycle name cannot be blank.');
        const bounds = this.bounds(dto, team.timezone);
        if (
          bounds &&
          (cycle.startedAt || (await this.repository.hasIssues(tx, cycleId)))
        )
          throw new ConflictException(
            'A started or assigned cycle cannot be rescheduled.',
          );
        if (
          bounds &&
          (await this.repository.overlap(
            tx,
            teamId,
            bounds.startsAt,
            bounds.endsAt,
            cycleId,
          ))
        )
          throw new ConflictException('Cycle windows overlap.');
        const changedFields = [
          ...(dto.name !== undefined ? ['name'] : []),
          ...(bounds ? ['starts_at', 'ends_at'] : []),
        ];
        if (!changedFields.length)
          throw new BadRequestException('No cycle changes supplied.');
        const updated = await this.repository.update(tx, cycle, {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...bounds,
        });
        await this.fact(tx, updated, actorId, 'cycle.updated', {
          cycle_id: cycleId,
          team_id: teamId,
          changed_fields: changedFields,
        });
        return updated;
      },
    );
  }
  start(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    cycleId: string,
    expectedRevision: number,
  ) {
    return this.execute(identity, workspaceId, teamId, async (tx, actorId) => {
      const cycle = await this.cycle(tx, workspaceId, teamId, cycleId, true);
      this.mutable(cycle);
      requireRevision(cycle.revision, expectedRevision);
      if (cycle.startedAt) return cycle;
      if (cycle.startsAt > new Date())
        throw new ConflictException('Cycle has not reached its start.');
      if (cycle.endsAt <= new Date())
        throw new ConflictException(
          'Cycle window has ended; complete it instead.',
        );
      return this.startCore(tx, cycle, actorId);
    });
  }
  complete(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    cycleId: string,
    dto: CompleteCycleDto,
  ) {
    return this.execute(
      identity,
      workspaceId,
      teamId,
      async (tx, actorId, team) => {
        const cycle = await this.cycle(tx, workspaceId, teamId, cycleId, true);
        if (!cycle.completedAt)
          requireRevision(cycle.revision, dto.expectedRevision);
        const result = await this.completeCore(
          tx,
          team,
          cycle,
          actorId,
          dto.nextCycleId,
        );
        return { cycle: result.cycle, nextCycleId: result.nextCycleId };
      },
    );
  }
  cancel(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    cycleId: string,
    expectedRevision: number,
  ) {
    return this.execute(identity, workspaceId, teamId, async (tx, actorId) => {
      const cycle = await this.cycle(tx, workspaceId, teamId, cycleId, true);
      requireRevision(cycle.revision, expectedRevision);
      this.mutable(cycle);
      if (await this.repository.hasIssues(tx, cycleId))
        throw new ConflictException(
          'Remove issue assignments before cancellation.',
        );
      const canceled = await this.repository.update(tx, cycle, {
        canceledAt: new Date(),
      });
      await this.fact(tx, canceled, actorId, 'cycle.canceled', {
        cycle_id: cycleId,
        team_id: teamId,
        canceled_at: canceled.canceledAt!.toISOString(),
      });
      return canceled;
    });
  }
  private execute<T>(
    identity: Identity,
    workspaceId: string,
    teamId: string,
    handler: (tx: Tx, actorId: string, team: Team) => Promise<T>,
    statusCode = 200,
  ) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { team, member } = await this.access.require(
          tx,
          identity.userId,
          workspaceId,
          teamId,
          'manage',
        );
        try {
          return await handler(tx, member.id, team);
        } catch (error) {
          if (error instanceof CyclePlanningError) {
            if (error.kind === 'conflict')
              throw new ConflictException(error.message);
            throw new BadRequestException(error.message);
          }
          throw error;
        }
      },
      {
        statusCode,
        authorize: async (tx) => {
          await this.access.require(
            tx,
            identity.userId,
            workspaceId,
            teamId,
            'manage',
            true,
          );
        },
      },
    );
  }
  private async cycle(
    tx: Tx,
    workspaceId: string,
    teamId: string,
    id: string,
    lock = false,
  ) {
    const cycle = await this.repository.get(tx, workspaceId, teamId, id, lock);
    if (!cycle) throw new NotFoundException('Cycle not found.');
    return cycle;
  }
  private mutable(cycle: Cycle) {
    if (cycle.completedAt || cycle.canceledAt)
      throw new ConflictException('Cycle is completed or canceled.');
  }
  private bounds(
    dto: {
      startsAt?: string;
      endsAt?: string;
      startDate?: string;
      endDate?: string;
    },
    timezone: string,
  ) {
    const utc = dto.startsAt !== undefined || dto.endsAt !== undefined;
    const local = dto.startDate !== undefined || dto.endDate !== undefined;
    if (
      (utc && local) ||
      (utc && (!dto.startsAt || !dto.endsAt)) ||
      (local && (!dto.startDate || !dto.endDate))
    )
      throw new BadRequestException('Supply exactly one complete date pair.');
    if (!utc && !local) return undefined;
    if (
      utc &&
      (!/(?:Z|[+-]\d{2}:\d{2})$/.test(dto.startsAt!) ||
        !/(?:Z|[+-]\d{2}:\d{2})$/.test(dto.endsAt!))
    )
      throw new BadRequestException(
        'Timestamp bounds need an explicit UTC offset.',
      );
    const startsAt = utc
      ? new Date(dto.startsAt!)
      : localMidnight(dto.startDate!, timezone);
    const endsAt = utc
      ? new Date(dto.endsAt!)
      : localMidnight(dto.endDate!, timezone);
    validateWindow(startsAt, endsAt);
    return { startsAt, endsAt };
  }
  private async insert(
    tx: Tx,
    team: Team,
    name: string,
    bounds: { startsAt: Date; endsAt: Date },
    actorId?: string,
  ) {
    if (
      await this.repository.overlap(tx, team.id, bounds.startsAt, bounds.endsAt)
    )
      throw new ConflictException('Cycle windows overlap.');
    const cycle = await this.repository.create(tx, {
      id: randomUUID(),
      workspaceId: team.workspaceId,
      teamId: team.id,
      number: await this.repository.nextNumber(tx, team.id),
      name,
      ...bounds,
    });
    await this.fact(tx, cycle, actorId, 'cycle.created', {
      cycle_id: cycle.id,
      team_id: team.id,
      starts_at: cycle.startsAt.toISOString(),
      ends_at: cycle.endsAt.toISOString(),
    });
    return cycle;
  }
  private async fact(
    tx: Tx,
    cycle: Cycle,
    actorId: string | undefined,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    await this.events.append(tx, {
      workspaceId: cycle.workspaceId,
      ...(actorId ? { actorId } : {}),
      eventType,
      aggregateType: 'cycle',
      aggregateId: cycle.id,
      payload,
    });
    await this.audit.append(tx, {
      workspaceId: cycle.workspaceId,
      ...(actorId ? { actorId } : {}),
      action: eventType,
      targetType: 'cycle',
      targetId: cycle.id,
      metadata: payload,
    });
  }
  private async startCore(
    tx: Tx,
    cycle: Cycle,
    actorId?: string,
    now = new Date(),
  ) {
    const started = await this.repository.update(tx, cycle, {
      startedAt: now,
      schedulerError: null,
      schedulerFailedAt: null,
    });
    await this.fact(tx, started, actorId, 'cycle.started', {
      cycle_id: cycle.id,
      team_id: cycle.teamId,
      started_at: started.startedAt!.toISOString(),
    });
    return started;
  }
  private async completionResult(tx: Tx, cycle: Cycle) {
    const history = await this.repository.history(tx, cycle.id);
    return {
      cycle,
      nextCycleId: cycle.completionNextCycleId,
      rolledOverCount: history.length,
      rolloverIssueIds: history.map((row) => row.issueId),
    };
  }
  private async completeCore(
    tx: Tx,
    team: Team,
    cycle: Cycle,
    actorId?: string,
    nextCycleId?: string,
    now = new Date(),
  ) {
    if (cycle.completedAt) return this.completionResult(tx, cycle);
    this.mutable(cycle);
    if (cycle.startsAt > now)
      throw new ConflictException('A future cycle cannot be completed.');
    const eligible = await this.repository.eligible(tx, cycle);
    let next: Cycle | undefined;
    if (nextCycleId) {
      next = await this.cycle(tx, team.workspaceId, team.id, nextCycleId, true);
      if (next.completedAt || next.canceledAt || next.startsAt < cycle.endsAt)
        throw new ConflictException(
          'Rollover destination must be an open later cycle.',
        );
    } else if (eligible.length) {
      next = await this.repository.next(tx, cycle);
      if (!next) {
        if (!team.cyclesEnabled)
          throw new ConflictException(
            'Provide a destination cycle or enable cycle scheduling.',
          );
        next = await this.insert(
          tx,
          team,
          `Cycle ${await this.repository.nextNumber(tx, team.id)}`,
          nextWindow(cycle.endsAt, team),
          actorId,
        );
      }
    }
    const completedAt = now;
    for (const issue of eligible) {
      await this.mutations.bump(tx, issue, issue.revision, {
        cycleId: next!.id,
      });
      await tx.insert(cycleRollovers).values({
        id: randomUUID(),
        workspaceId: team.workspaceId,
        teamId: team.id,
        issueId: issue.id,
        fromCycleId: cycle.id,
        toCycleId: next!.id,
        rolledAt: completedAt,
      });
      await this.mutations.fact(
        tx,
        team.workspaceId,
        actorId,
        issue.id,
        'issue.cycle_changed',
        { issue_id: issue.id, cycle_id: next!.id, previous_cycle_id: cycle.id },
      );
    }
    const completed = await this.repository.update(tx, cycle, {
      completedAt,
      completionNextCycleId: next?.id ?? null,
      schedulerError: null,
      schedulerFailedAt: null,
    });
    await this.fact(tx, completed, actorId, 'cycle.completed', {
      cycle_id: cycle.id,
      team_id: team.id,
      completed_at: completedAt.toISOString(),
      next_cycle_id: next?.id ?? null,
      rolled_over_count: eligible.length,
      rollover_issue_ids: eligible.map((issue) => issue.id),
    });
    return {
      cycle: completed,
      nextCycleId: next?.id ?? null,
      rolledOverCount: eligible.length,
      rolloverIssueIds: eligible.map((issue) => issue.id),
    };
  }
  // Scheduler and manual completion share the same transaction core. One completion
  // per team per sweep bounds missed-schedule catch-up and releases locks promptly.
  async runScheduled(limit = 20, now = new Date()) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error('Invalid cycle scheduler batch limit.');
    const due = await this.db.db.transaction((tx) =>
      this.repository.due(tx, now, limit),
    );
    const seen = new Set<string>();
    let processed = 0;
    for (const { cycle: hint } of due) {
      if (seen.has(hint.teamId)) continue;
      seen.add(hint.teamId);
      try {
        await this.db.db.transaction(async (tx) => {
          const [workspace] = await tx
            .select()
            .from(workspaces)
            .where(eq(workspaces.id, hint.workspaceId))
            .for('update');
          if (!workspace || workspace.archivedAt || workspace.deletedAt) return;
          const [team] = await tx
            .select()
            .from(teams)
            .where(
              and(
                eq(teams.id, hint.teamId),
                eq(teams.workspaceId, hint.workspaceId),
              ),
            )
            .for('update');
          if (!team || team.retiredAt || !team.cyclesEnabled) return;
          const cycle = await this.cycle(
            tx,
            team.workspaceId,
            team.id,
            hint.id,
            true,
          );
          if (cycle.completedAt || cycle.canceledAt) return;
          if (cycle.endsAt <= now)
            await this.completeCore(tx, team, cycle, undefined, undefined, now);
          else if (!cycle.startedAt && cycle.startsAt <= now)
            await this.startCore(tx, cycle, undefined, now);
          else return;
          processed++;
        });
      } catch {
        this.logger.error(
          `Cycle scheduling failed for cycle ${hint.id}; completion was rolled back.`,
        );
        await this.recordFailure(hint);
      }
    }
    const needsPlans = await this.db.db.transaction((tx) =>
      this.repository.teamsNeedingPlans(tx, now, limit),
    );
    for (const hint of needsPlans) {
      try {
        await this.maintainPlans(hint, now);
      } catch {
        this.logger.error(
          `Cycle plan maintenance failed for team ${hint.teamId}; it will retry next sweep.`,
        );
      }
    }
    return processed;
  }
  private async maintainPlans(
    hint: { teamId: string; workspaceId: string },
    now: Date,
  ) {
    await this.db.db.transaction(async (tx) => {
      const [workspace] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, hint.workspaceId))
        .for('update');
      if (!workspace || workspace.archivedAt || workspace.deletedAt) return;
      const [team] = await tx
        .select()
        .from(teams)
        .where(
          and(
            eq(teams.id, hint.teamId),
            eq(teams.workspaceId, hint.workspaceId),
          ),
        )
        .for('update');
      if (!team || team.retiredAt || !team.cyclesEnabled) return;
      const count = await this.repository.futureCount(tx, team.id, now);
      const last = await this.repository.last(tx, team.id);
      let after = last && last.endsAt > now ? last.endsAt : now;
      for (let n = count; n < team.upcomingCyclesCount; n++) {
        const bounds = nextWindow(after, team);
        const cycle = await this.insert(
          tx,
          team,
          `Cycle ${await this.repository.nextNumber(tx, team.id)}`,
          bounds,
        );
        after = cycle.endsAt;
      }
    });
  }
  private async recordFailure(hint: Cycle) {
    await this.db.db.transaction(async (tx) => {
      const [workspace] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, hint.workspaceId))
        .for('update');
      if (!workspace || workspace.archivedAt || workspace.deletedAt) return;
      const [team] = await tx
        .select()
        .from(teams)
        .where(eq(teams.id, hint.teamId))
        .for('update');
      if (!team || team.retiredAt) return;
      const cycle = await this.cycle(
        tx,
        hint.workspaceId,
        hint.teamId,
        hint.id,
        true,
      );
      if (cycle.completedAt || cycle.canceledAt) return;
      // Operational metadata does not advance the business revision or event head.
      await tx
        .update(cycles)
        .set({
          schedulerError: 'SCHEDULE_FAILED',
          schedulerFailedAt: new Date(),
        })
        .where(eq(cycles.id, cycle.id));
    });
  }
}
