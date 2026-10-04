import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  cycles,
  cycleRollovers,
  issues,
  issueStatuses,
  teams,
  workspaces,
} from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import type { CursorTuple } from '../../../common/pagination/cursor';
import { issueVisibility } from '../../issues/infrastructure/issue.repository';
export type Cycle = typeof cycles.$inferSelect;
@Injectable()
export class CycleRepository {
  async get(
    tx: Tx,
    workspaceId: string,
    teamId: string,
    id: string,
    lock = false,
  ) {
    const query = tx
      .select()
      .from(cycles)
      .where(
        and(
          eq(cycles.workspaceId, workspaceId),
          eq(cycles.teamId, teamId),
          eq(cycles.id, id),
        ),
      );
    return (await (lock ? query.for('update') : query))[0];
  }
  async list(
    tx: Tx,
    workspaceId: string,
    teamId: string,
    limit: number,
    cursor?: CursorTuple,
  ) {
    const scope = and(
      eq(cycles.workspaceId, workspaceId),
      eq(cycles.teamId, teamId),
    );
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(cycles)
      .where(scope);
    const rows = await tx
      .select()
      .from(cycles)
      .where(
        and(
          scope,
          cursor
            ? sql`(date_trunc('milliseconds',${cycles.createdAt}),${cycles.id})<(${cursor.createdAt.toISOString()}::timestamptz,${cursor.id})`
            : undefined,
        ),
      )
      .orderBy(
        desc(sql`date_trunc('milliseconds',${cycles.createdAt})`),
        desc(cycles.id),
      )
      .limit(limit);
    return { rows, total: count?.total ?? 0 };
  }
  async nextNumber(tx: Tx, teamId: string) {
    const [row] = await tx
      .select({ number: sql<number>`coalesce(max(${cycles.number}),0)::int+1` })
      .from(cycles)
      .where(eq(cycles.teamId, teamId));
    return row!.number;
  }
  async overlap(
    tx: Tx,
    teamId: string,
    startsAt: Date,
    endsAt: Date,
    except?: string,
  ) {
    return (
      await tx
        .select({ id: cycles.id })
        .from(cycles)
        .where(
          and(
            eq(cycles.teamId, teamId),
            isNull(cycles.canceledAt),
            sql`${cycles.startsAt}<${endsAt} AND ${cycles.endsAt}>${startsAt}`,
            except ? sql`${cycles.id}<>${except}` : undefined,
          ),
        )
        .limit(1)
    )[0];
  }
  async create(tx: Tx, value: typeof cycles.$inferInsert) {
    return (await tx.insert(cycles).values(value).returning())[0]!;
  }
  async update(
    tx: Tx,
    cycle: Cycle,
    patch: Partial<typeof cycles.$inferInsert>,
  ) {
    return (
      await tx
        .update(cycles)
        .set({ ...patch, revision: cycle.revision + 1, updatedAt: new Date() })
        .where(eq(cycles.id, cycle.id))
        .returning()
    )[0]!;
  }
  async last(tx: Tx, teamId: string) {
    return (
      await tx
        .select()
        .from(cycles)
        .where(and(eq(cycles.teamId, teamId), isNull(cycles.canceledAt)))
        .orderBy(desc(cycles.endsAt), desc(cycles.id))
        .limit(1)
    )[0];
  }
  async next(tx: Tx, cycle: Cycle) {
    return (
      await tx
        .select()
        .from(cycles)
        .where(
          and(
            eq(cycles.teamId, cycle.teamId),
            isNull(cycles.completedAt),
            isNull(cycles.canceledAt),
            sql`${cycles.startsAt}>=${cycle.endsAt}`,
          ),
        )
        .orderBy(asc(cycles.startsAt), asc(cycles.id))
        .limit(1)
    )[0];
  }
  async eligible(tx: Tx, cycle: Cycle) {
    const rows = await tx
      .select({ issue: issues })
      .from(issues)
      .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
      .where(
        and(
          eq(issues.workspaceId, cycle.workspaceId),
          eq(issues.teamId, cycle.teamId),
          eq(issues.cycleId, cycle.id),
          isNull(issues.deletedAt),
          isNull(issues.archivedAt),
          sql`${issueStatuses.category} IN ('UNSTARTED','STARTED')`,
        ),
      )
      .orderBy(asc(issues.id))
      .for('update', { of: issues });
    return rows.map((row) => row.issue);
  }
  async hasIssues(tx: Tx, cycleId: string) {
    return !!(
      await tx
        .select({ id: issues.id })
        .from(issues)
        .where(and(eq(issues.cycleId, cycleId), isNull(issues.deletedAt)))
        .limit(1)
    )[0];
  }
  history(tx: Tx, cycleId: string) {
    return tx
      .select()
      .from(cycleRollovers)
      .where(eq(cycleRollovers.fromCycleId, cycleId))
      .orderBy(asc(cycleRollovers.issueId));
  }
  async report(tx: Tx, cycle: Cycle, memberId: string, guest: boolean) {
    const counts = await tx
      .select({
        category: issueStatuses.category,
        count: sql<number>`count(*)::int`,
        estimate: sql<number>`coalesce(sum(${issues.estimate}),0)::float8`,
      })
      .from(issues)
      .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
      .where(
        and(
          eq(issues.workspaceId, cycle.workspaceId),
          eq(issues.cycleId, cycle.id),
          isNull(issues.deletedAt),
          isNull(issues.archivedAt),
          issueVisibility(memberId, guest),
        ),
      )
      .groupBy(issueStatuses.category);
    const history = await tx
      .select({
        issueId: cycleRollovers.issueId,
        toCycleId: cycleRollovers.toCycleId,
        rolledAt: cycleRollovers.rolledAt,
      })
      .from(cycleRollovers)
      .innerJoin(issues, eq(issues.id, cycleRollovers.issueId))
      .where(
        and(
          eq(cycleRollovers.fromCycleId, cycle.id),
          eq(issues.workspaceId, cycle.workspaceId),
          isNull(issues.deletedAt),
          issueVisibility(memberId, guest),
        ),
      )
      .orderBy(asc(cycleRollovers.issueId));
    return {
      categories: counts,
      total: counts.reduce((n, row) => n + row.count, 0),
      rolledOverCount: history.length,
      rollovers: history,
    };
  }
  async due(tx: Tx, now: Date, limit: number) {
    return tx
      .select({ cycle: cycles })
      .from(cycles)
      .innerJoin(teams, eq(teams.id, cycles.teamId))
      .innerJoin(workspaces, eq(workspaces.id, cycles.workspaceId))
      .where(
        and(
          isNull(workspaces.archivedAt),
          isNull(workspaces.deletedAt),
          isNull(cycles.completedAt),
          isNull(cycles.canceledAt),
          isNull(teams.retiredAt),
          eq(teams.cyclesEnabled, true),
          sql`${cycles.startsAt}<=${now} AND (${cycles.startedAt} IS NULL OR ${cycles.endsAt}<=${now})`,
          sql`${cycles.id}=(SELECT candidate.id FROM cycles candidate WHERE candidate.team_id=${cycles.teamId} AND candidate.completed_at IS NULL AND candidate.canceled_at IS NULL AND candidate.starts_at<=${now} AND (candidate.started_at IS NULL OR candidate.ends_at<=${now}) ORDER BY candidate.ends_at,candidate.id LIMIT 1)`,
        ),
      )
      .orderBy(
        asc(sql`coalesce(${cycles.schedulerFailedAt},${cycles.endsAt})`),
        asc(cycles.endsAt),
        asc(cycles.id),
      )
      .limit(limit);
  }
  async futureCount(tx: Tx, teamId: string, now: Date) {
    const [count] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(cycles)
      .where(
        and(
          eq(cycles.teamId, teamId),
          isNull(cycles.completedAt),
          isNull(cycles.canceledAt),
          sql`${cycles.startsAt}>${now}`,
        ),
      );
    return count?.count ?? 0;
  }
  async teamsNeedingPlans(tx: Tx, now: Date, limit: number) {
    return tx
      .select({ teamId: teams.id, workspaceId: teams.workspaceId })
      .from(teams)
      .innerJoin(workspaces, eq(workspaces.id, teams.workspaceId))
      .where(
        and(
          eq(teams.cyclesEnabled, true),
          isNull(teams.retiredAt),
          isNull(workspaces.archivedAt),
          isNull(workspaces.deletedAt),
          sql`(SELECT count(*) FROM cycles future WHERE future.team_id=${teams.id} AND future.completed_at IS NULL AND future.canceled_at IS NULL AND future.starts_at>${now})<${teams.upcomingCyclesCount}`,
        ),
      )
      .orderBy(asc(teams.id))
      .limit(limit);
  }
}
