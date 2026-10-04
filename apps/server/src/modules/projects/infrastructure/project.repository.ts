import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  projects,
  projectTeams,
  projectMembers,
  projectMilestones,
  projectUpdates,
  projectStatuses,
  memberships,
  teams,
  teamMemberships,
  issues,
  issueStatuses,
} from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import type { CursorTuple } from '../../../common/pagination/cursor';
export type Project = typeof projects.$inferSelect;
export type ProjectStatus = typeof projectStatuses.$inferSelect;
@Injectable()
export class ProjectRepository {
  async project(tx: Tx, workspaceId: string, id: string, lock = false) {
    const q = tx
      .select()
      .from(projects)
      .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)));
    return (await (lock ? q.for('update') : q))[0];
  }
  async links(tx: Tx, id: string) {
    return tx
      .select()
      .from(projectTeams)
      .where(eq(projectTeams.projectId, id))
      .orderBy(asc(projectTeams.teamId));
  }
  async member(tx: Tx, id: string, membershipId: string) {
    return (
      await tx
        .select()
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, id),
            eq(projectMembers.membershipId, membershipId),
          ),
        )
    )[0];
  }
  async workspaceMember(tx: Tx, workspaceId: string, id: string) {
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
    tx: Tx,
    workspaceId: string,
    membershipId: string,
    limit: number,
    cursor?: CursorTuple,
  ) {
    const visible = sql`NOT EXISTS(SELECT 1 FROM ${projectTeams} pt JOIN ${teams} t ON t.id=pt.team_id WHERE pt.project_id=${projects.id} AND t.visibility='PRIVATE' AND NOT EXISTS(SELECT 1 FROM ${teamMemberships} tm WHERE tm.team_id=t.id AND tm.membership_id=${membershipId}))`;
    const scope = and(
      eq(projects.workspaceId, workspaceId),
      isNull(projects.deletedAt),
      isNull(projects.archivedAt),
      visible,
    );
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(projects)
      .where(scope);
    const rows = await tx
      .select()
      .from(projects)
      .where(
        and(
          scope,
          cursor
            ? sql`(date_trunc('milliseconds',${projects.createdAt}),${projects.id})<(${cursor.createdAt.toISOString()}::timestamptz,${cursor.id})`
            : undefined,
        ),
      )
      .orderBy(
        desc(sql`date_trunc('milliseconds',${projects.createdAt})`),
        desc(projects.id),
      )
      .limit(limit);
    return { rows, total: count?.total ?? 0 };
  }
  async create(tx: Tx, value: typeof projects.$inferInsert) {
    return (await tx.insert(projects).values(value).returning())[0]!;
  }
  async update(
    tx: Tx,
    id: string,
    value: Partial<typeof projects.$inferInsert>,
  ) {
    return (
      await tx
        .update(projects)
        .set({ ...value, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning()
    )[0]!;
  }
  async addTeam(tx: Tx, value: typeof projectTeams.$inferInsert) {
    return (await tx.insert(projectTeams).values(value).returning())[0]!;
  }
  async removeTeam(tx: Tx, projectId: string, teamId: string) {
    await tx
      .delete(projectTeams)
      .where(
        and(
          eq(projectTeams.projectId, projectId),
          eq(projectTeams.teamId, teamId),
        ),
      );
  }
  async teamIssueUsage(tx: Tx, projectId: string, teamId: string) {
    return (
      (
        await tx
          .select({ id: issues.id })
          .from(issues)
          .where(
            and(eq(issues.projectId, projectId), eq(issues.teamId, teamId)),
          )
          .limit(1)
      ).length > 0
    );
  }
  members(tx: Tx, projectId: string) {
    return tx
      .select({
        id: projectMembers.id,
        membershipId: projectMembers.membershipId,
        createdAt: projectMembers.createdAt,
        state: memberships.state,
        role: memberships.role,
      })
      .from(projectMembers)
      .innerJoin(memberships, eq(memberships.id, projectMembers.membershipId))
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(asc(projectMembers.createdAt), asc(projectMembers.id));
  }
  async addMember(tx: Tx, value: typeof projectMembers.$inferInsert) {
    return (await tx.insert(projectMembers).values(value).returning())[0]!;
  }
  async removeMember(tx: Tx, projectId: string, membershipId: string) {
    await tx
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.membershipId, membershipId),
        ),
      );
  }
  async progress(tx: Tx, projectId: string) {
    const [row] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter(where ${issueStatuses.category}='COMPLETED')::int`,
        canceled: sql<number>`count(*) filter(where ${issueStatuses.category}='CANCELED')::int`,
        duplicate: sql<number>`count(*) filter(where ${issueStatuses.category}='DUPLICATE')::int`,
        unfinished: sql<number>`count(*) filter(where ${issueStatuses.category} not in ('COMPLETED','CANCELED','DUPLICATE'))::int`,
      })
      .from(issues)
      .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
      .where(and(eq(issues.projectId, projectId), isNull(issues.deletedAt)));
    const result = row ?? {
      total: 0,
      completed: 0,
      canceled: 0,
      duplicate: 0,
      unfinished: 0,
    };
    return {
      ...result,
      percentComplete: result.total
        ? Math.round((result.completed / result.total) * 10000) / 100
        : 0,
    };
  }
  statuses(tx: Tx, workspaceId: string) {
    return tx
      .select()
      .from(projectStatuses)
      .where(
        and(
          eq(projectStatuses.workspaceId, workspaceId),
          isNull(projectStatuses.archivedAt),
        ),
      )
      .orderBy(asc(projectStatuses.position), asc(projectStatuses.id));
  }
  async createStatus(tx: Tx, value: typeof projectStatuses.$inferInsert) {
    return (await tx.insert(projectStatuses).values(value).returning())[0]!;
  }
  async updateStatus(
    tx: Tx,
    id: string,
    value: Partial<typeof projectStatuses.$inferInsert>,
  ) {
    return (
      await tx
        .update(projectStatuses)
        .set({ ...value, updatedAt: new Date() })
        .where(eq(projectStatuses.id, id))
        .returning()
    )[0]!;
  }
  async reorderStatuses(tx: Tx, workspaceId: string, ids: string[]) {
    await tx
      .update(projectStatuses)
      .set({
        position: sql`${projectStatuses.position}+100000`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectStatuses.workspaceId, workspaceId),
          isNull(projectStatuses.archivedAt),
        ),
      );
    for (const [position, id] of ids.entries())
      await this.updateStatus(tx, id, { position });
  }
  async statusUsage(tx: Tx, id: string) {
    return tx
      .select()
      .from(projects)
      .where(eq(projects.statusId, id))
      .orderBy(asc(projects.id));
  }
  milestones(tx: Tx, projectId: string) {
    return tx
      .select()
      .from(projectMilestones)
      .where(eq(projectMilestones.projectId, projectId))
      .orderBy(asc(projectMilestones.position), asc(projectMilestones.id));
  }
  async createMilestone(tx: Tx, value: typeof projectMilestones.$inferInsert) {
    return (await tx.insert(projectMilestones).values(value).returning())[0]!;
  }
  async updateMilestone(
    tx: Tx,
    id: string,
    value: Partial<typeof projectMilestones.$inferInsert>,
  ) {
    return (
      await tx
        .update(projectMilestones)
        .set({ ...value, updatedAt: new Date() })
        .where(eq(projectMilestones.id, id))
        .returning()
    )[0]!;
  }
  async milestoneUsage(tx: Tx, id: string) {
    return (
      (
        await tx
          .select({ id: issues.id })
          .from(issues)
          .where(eq(issues.milestoneId, id))
          .limit(1)
      ).length > 0
    );
  }
  async deleteMilestone(tx: Tx, id: string) {
    await tx.delete(projectMilestones).where(eq(projectMilestones.id, id));
  }
  async reorderMilestones(tx: Tx, projectId: string, ids: string[]) {
    await tx
      .update(projectMilestones)
      .set({
        position: sql`${projectMilestones.position}+100000`,
        updatedAt: new Date(),
      })
      .where(eq(projectMilestones.projectId, projectId));
    for (const [position, id] of ids.entries())
      await this.updateMilestone(tx, id, { position });
  }
  async updates(
    tx: Tx,
    projectId: string,
    limit: number,
    cursor?: CursorTuple,
  ) {
    const scope = and(
      eq(projectUpdates.projectId, projectId),
      isNull(projectUpdates.deletedAt),
    );
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(projectUpdates)
      .where(scope);
    const rows = await tx
      .select()
      .from(projectUpdates)
      .where(
        and(
          scope,
          cursor
            ? sql`(date_trunc('milliseconds',${projectUpdates.createdAt}),${projectUpdates.id})<(${cursor.createdAt.toISOString()}::timestamptz,${cursor.id})`
            : undefined,
        ),
      )
      .orderBy(
        desc(sql`date_trunc('milliseconds',${projectUpdates.createdAt})`),
        desc(projectUpdates.id),
      )
      .limit(limit);
    return { rows, total: count?.total ?? 0 };
  }
  async publish(tx: Tx, value: typeof projectUpdates.$inferInsert) {
    return (await tx.insert(projectUpdates).values(value).returning())[0]!;
  }
}
