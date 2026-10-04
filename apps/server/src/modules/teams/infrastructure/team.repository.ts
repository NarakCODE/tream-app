import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  teams,
  teamMemberships,
  issueStatuses,
  issues,
  memberships,
  projectTeams,
  projects,
  cycles,
} from '../../../database/schema';
import type { DatabaseTransaction } from '../../../database/transaction';
import type { CursorTuple } from '../../../common/pagination/cursor';
export type Team = typeof teams.$inferSelect;
export type Status = typeof issueStatuses.$inferSelect;
@Injectable()
export class TeamRepository {
  async team(
    tx: DatabaseTransaction,
    workspaceId: string,
    id: string,
    lock = false,
  ) {
    const query = tx
      .select()
      .from(teams)
      .where(and(eq(teams.id, id), eq(teams.workspaceId, workspaceId)));
    return (await (lock ? query.for('update') : query))[0];
  }
  async member(tx: DatabaseTransaction, teamId: string, membershipId: string) {
    return (
      await tx
        .select()
        .from(teamMemberships)
        .where(
          and(
            eq(teamMemberships.teamId, teamId),
            eq(teamMemberships.membershipId, membershipId),
          ),
        )
    )[0];
  }
  async workspaceMember(
    tx: DatabaseTransaction,
    workspaceId: string,
    id: string,
  ) {
    return (
      await tx
        .select()
        .from(memberships)
        .where(
          and(eq(memberships.workspaceId, workspaceId), eq(memberships.id, id)),
        )
    )[0];
  }
  async list(
    tx: DatabaseTransaction,
    workspaceId: string,
    membershipId: string,
    guest: boolean,
    limit: number,
    cursor?: CursorTuple,
  ) {
    const visible = sql`((${teams.visibility}='WORKSPACE' and ${!guest}) or exists(select 1 from ${teamMemberships} tm where tm.team_id=${teams.id} and tm.membership_id=${membershipId}))`;
    const scope = and(
      eq(teams.workspaceId, workspaceId),
      isNull(teams.retiredAt),
      visible,
    );
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(teams)
      .where(scope);
    const rows = await tx
      .select()
      .from(teams)
      .where(
        and(
          scope,
          cursor
            ? sql`(date_trunc('milliseconds',${teams.createdAt}),${teams.id})<(${cursor.createdAt.toISOString()}::timestamptz,${cursor.id})`
            : undefined,
        ),
      )
      .orderBy(
        desc(sql`date_trunc('milliseconds',${teams.createdAt})`),
        desc(teams.id),
      )
      .limit(limit);
    return { rows, total: count?.total ?? 0 };
  }
  async create(tx: DatabaseTransaction, value: typeof teams.$inferInsert) {
    return (await tx.insert(teams).values(value).returning())[0]!;
  }
  async update(
    tx: DatabaseTransaction,
    id: string,
    value: Partial<typeof teams.$inferInsert>,
  ) {
    return (
      await tx
        .update(teams)
        .set({ ...value, updatedAt: new Date() })
        .where(eq(teams.id, id))
        .returning()
    )[0]!;
  }
  async members(tx: DatabaseTransaction, teamId: string) {
    return tx
      .select({
        id: teamMemberships.id,
        membershipId: teamMemberships.membershipId,
        role: teamMemberships.role,
        createdAt: teamMemberships.createdAt,
      })
      .from(teamMemberships)
      .innerJoin(memberships, eq(memberships.id, teamMemberships.membershipId))
      .where(
        and(
          eq(teamMemberships.teamId, teamId),
          eq(memberships.state, 'ACTIVE'),
        ),
      )
      .orderBy(asc(teamMemberships.createdAt), asc(teamMemberships.id));
  }
  async addMember(
    tx: DatabaseTransaction,
    value: typeof teamMemberships.$inferInsert,
  ) {
    return (await tx.insert(teamMemberships).values(value).returning())[0]!;
  }
  async updateMember(
    tx: DatabaseTransaction,
    teamId: string,
    membershipId: string,
    role: 'MEMBER' | 'ADMIN',
  ) {
    return (
      await tx
        .update(teamMemberships)
        .set({ role, updatedAt: new Date() })
        .where(
          and(
            eq(teamMemberships.teamId, teamId),
            eq(teamMemberships.membershipId, membershipId),
          ),
        )
        .returning()
    )[0]!;
  }
  async removeMember(
    tx: DatabaseTransaction,
    teamId: string,
    membershipId: string,
  ) {
    await tx
      .delete(teamMemberships)
      .where(
        and(
          eq(teamMemberships.teamId, teamId),
          eq(teamMemberships.membershipId, membershipId),
        ),
      );
  }
  statuses(tx: DatabaseTransaction, teamId: string) {
    return tx
      .select()
      .from(issueStatuses)
      .where(
        and(eq(issueStatuses.teamId, teamId), isNull(issueStatuses.retiredAt)),
      )
      .orderBy(asc(issueStatuses.position), asc(issueStatuses.id));
  }
  async createStatus(
    tx: DatabaseTransaction,
    value: typeof issueStatuses.$inferInsert,
  ) {
    return (await tx.insert(issueStatuses).values(value).returning())[0]!;
  }
  async updateStatus(
    tx: DatabaseTransaction,
    id: string,
    value: Partial<typeof issueStatuses.$inferInsert>,
  ) {
    return (
      await tx
        .update(issueStatuses)
        .set({ ...value, updatedAt: new Date() })
        .where(eq(issueStatuses.id, id))
        .returning()
    )[0]!;
  }
  async reorder(tx: DatabaseTransaction, teamId: string, ids: string[]) {
    // Move all active positions out of the final range before assigning to avoid transient unique collisions.
    await tx
      .update(issueStatuses)
      .set({
        position: sql`${issueStatuses.position}+100000`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(issueStatuses.teamId, teamId), isNull(issueStatuses.retiredAt)),
      );
    for (const [position, id] of ids.entries())
      await this.updateStatus(tx, id, { position });
  }
  async statusUsage(tx: DatabaseTransaction, id: string) {
    const [row] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(issues)
      .where(eq(issues.statusId, id));
    return row?.total ?? 0;
  }
  async replaceStatus(
    tx: DatabaseTransaction,
    id: string,
    replacementId: string,
  ) {
    return tx
      .update(issues)
      .set({ statusId: replacementId, updatedAt: new Date() })
      .where(eq(issues.statusId, id))
      .returning({ id: issues.id });
  }
  async retirementDependencies(tx: DatabaseTransaction, id: string) {
    const activeIssues = await tx
      .select({ id: issues.id })
      .from(issues)
      .where(
        and(
          eq(issues.teamId, id),
          isNull(issues.deletedAt),
          sql`exists(select 1 from ${issueStatuses} s where s.id=${issues.statusId} and s.category not in ('COMPLETED','CANCELED','DUPLICATE'))`,
        ),
      )
      .limit(1);
    const activeProjects = await tx
      .select({ id: projectTeams.id })
      .from(projectTeams)
      .innerJoin(projects, eq(projects.id, projectTeams.projectId))
      .where(and(eq(projectTeams.teamId, id), isNull(projects.deletedAt)))
      .limit(1);
    const activeCycles = await tx
      .select({ id: cycles.id })
      .from(cycles)
      .where(
        and(
          eq(cycles.teamId, id),
          isNull(cycles.completedAt),
          isNull(cycles.canceledAt),
        ),
      )
      .limit(1);
    return !!(
      activeIssues.length ||
      activeProjects.length ||
      activeCycles.length
    );
  }
  async increment(tx: DatabaseTransaction, id: string) {
    return (
      (
        await tx
          .update(teams)
          .set({
            nextIssueNumber: sql`${teams.nextIssueNumber}+1`,
            updatedAt: new Date(),
          })
          .where(eq(teams.id, id))
          .returning({ next: teams.nextIssueNumber })
      )[0]!.next - 1
    );
  }
}
