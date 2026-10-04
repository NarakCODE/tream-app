import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNull, isNotNull, sql } from 'drizzle-orm';
import {
  initiatives,
  initiativeProjects,
  initiativeUpdates,
  initiativeSubscribers,
  memberships,
  projects,
  issues,
  issueStatuses,
} from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { DatabaseService } from '../../../database/database.service';
import { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import { EventWriter } from '../../eventing/application/event-writer.service';
import { AuditWriter } from '../../audit/application/audit-writer.service';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import { InitiativeAccessService } from './initiative-access.service';
import { initiativeVisibility } from '../infrastructure/initiative-visibility';
import type {
  CreateInitiativeDto,
  UpdateInitiativeDto,
  InitiativeListDto,
  InitiativeUpdateDto,
  EditInitiativeUpdateDto,
} from '../presentation/initiative.dto';
type Initiative = typeof initiatives.$inferSelect;
@Injectable()
export class InitiativeService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: InitiativeAccessService,
    private readonly commands: CommandBus,
    private readonly events: EventWriter,
    private readonly audit: AuditWriter,
  ) {}
  private check(row: { revision: number }, expected: number) {
    if (row.revision !== expected)
      throw new ConflictException(
        'Revision conflict. Fetch the current resource and retry.',
      );
  }
  private async fact(
    tx: Tx,
    w: string,
    actor: string,
    id: string,
    event: string,
    payload: Record<string, unknown> = {},
  ) {
    const eventType = `initiative.${event}`;
    const body = { initiative_id: id, ...payload };
    await this.events.append(tx, {
      workspaceId: w,
      actorId: actor,
      aggregateType: 'initiative',
      aggregateId: id,
      eventType,
      payload: body,
    });
    await this.audit.append(tx, {
      workspaceId: w,
      actorId: actor,
      action: eventType,
      targetType: 'initiative',
      targetId: id,
      metadata: body,
    });
  }
  private async bump(
    tx: Tx,
    row: Initiative,
    expected: number,
    patch: Partial<typeof initiatives.$inferInsert> = {},
  ) {
    this.check(row, expected);
    return (
      await tx
        .update(initiatives)
        .set({ ...patch, revision: row.revision + 1, updatedAt: new Date() })
        .where(eq(initiatives.id, row.id))
        .returning()
    )[0]!;
  }
  private run<T>(
    identity: Identity,
    w: string,
    id: string,
    mode: 'read' | 'manage',
    handler: (tx: Tx, row: Initiative, actor: string) => Promise<T>,
    allowInactive = false,
    statusCode = 200,
  ) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { initiative, member } = await this.access.require(
          tx,
          identity.userId,
          w,
          id,
          mode,
          false,
          allowInactive,
        );
        if (!allowInactive && (initiative.archivedAt || initiative.deletedAt))
          throw new ConflictException('Initiative is inactive.');
        return handler(tx, initiative, member.id);
      },
      {
        statusCode,
        authorize: async (tx) => {
          const { initiative } = await this.access.require(
            tx,
            identity.userId,
            w,
            id,
            mode,
            true,
            allowInactive,
          );
          if (!allowInactive && (initiative.archivedAt || initiative.deletedAt))
            throw new ConflictException('Initiative is inactive.');
        },
      },
    );
  }
  async list(userId: string, w: string, q: InitiativeListDto) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.access.workspace.require(
        tx,
        userId,
        w,
        'workspace.read',
      );
      const base = and(
        eq(initiatives.workspaceId, w),
        initiativeVisibility(member.id, member.role === 'GUEST'),
        q.lifecycle === 'deleted'
          ? isNotNull(initiatives.deletedAt)
          : isNull(initiatives.deletedAt),
        q.lifecycle === 'archived'
          ? isNotNull(initiatives.archivedAt)
          : q.lifecycle === 'active'
            ? isNull(initiatives.archivedAt)
            : undefined,
        q.status ? eq(initiatives.status, q.status) : undefined,
      );
      const [count] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(initiatives)
        .where(base);
      const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
      const rows = await tx
        .select()
        .from(initiatives)
        .where(
          and(
            base,
            cursor
              ? sql`(date_trunc('milliseconds',${initiatives.createdAt}),${initiatives.id}) < (${cursor.createdAt.toISOString()}::timestamptz,${cursor.id})`
              : undefined,
          ),
        )
        .orderBy(
          desc(sql`date_trunc('milliseconds',${initiatives.createdAt})`),
          desc(initiatives.id),
        )
        .limit(q.limit + 1);
      const items = rows.slice(0, q.limit);
      return {
        paginationType: 'cursor',
        items,
        total: count!.total,
        limit: q.limit,
        cursor: q.cursor ?? null,
        nextCursor:
          rows.length > q.limit ? encodeCursor(items[items.length - 1]!) : null,
        hasNext: rows.length > q.limit,
      };
    });
  }
  get(userId: string, w: string, id: string) {
    return this.db.db.transaction(
      async (tx) => (await this.access.require(tx, userId, w, id)).initiative,
    );
  }
  private async owner(tx: Tx, w: string, id: string | null | undefined) {
    if (id) {
      const [row] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.id, id),
            eq(memberships.workspaceId, w),
            eq(memberships.state, 'ACTIVE'),
          ),
        )
        .limit(1);
      if (!row || row.role === 'GUEST')
        throw new BadRequestException(
          'Lead must be an active non-guest workspace membership.',
        );
    }
  }
  create(identity: Identity, w: string, dto: CreateInitiativeDto) {
    const authorize = async (tx: Tx) => {
      const { member } = await this.access.workspace.require(
        tx,
        identity.userId,
        w,
        'workspace.read',
        { lock: true },
      );
      if (!['OWNER', 'ADMIN'].includes(member.role))
        throw new ForbiddenException(
          'Initiative creation requires an administrator.',
        );
      for (const id of [...(dto.projectIds ?? [])].sort())
        await this.access.projects.require(
          tx,
          identity.userId,
          w,
          id,
          'manage',
          true,
        );
    };
    return this.commands.execute(
      identity,
      async (tx) => {
        const { member } = await this.access.workspace.require(
          tx,
          identity.userId,
          w,
          'workspace.read',
        );
        await this.owner(tx, w, dto.ownerId);
        const projectIds = dto.projectIds ?? [];
        if (dto.status === 'COMPLETED' || dto.status === 'CANCELED')
          await this.terminalProjects(tx, w, projectIds);
        const [row] = await tx
          .insert(initiatives)
          .values({
            id: randomUUID(),
            workspaceId: w,
            createdById: member.id,
            name: dto.name.trim(),
            description: dto.description,
            status: dto.status ?? 'PLANNED',
            ownerId: dto.ownerId ?? null,
            targetDate: dto.targetDate,
            position: dto.position ?? 0,
          })
          .returning();
        for (let position = 0; position < projectIds.length; position++)
          await tx.insert(initiativeProjects).values({
            id: randomUUID(),
            workspaceId: w,
            initiativeId: row!.id,
            projectId: projectIds[position]!,
            position,
          });
        await this.fact(tx, w, member.id, row!.id, 'created');
        return row!;
      },
      { statusCode: 201, authorize },
    );
  }
  private async terminalProjects(tx: Tx, w: string, ids: string[]) {
    for (const id of ids) {
      const [row] = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.workspaceId, w), eq(projects.id, id)))
        .limit(1);
      if (
        row &&
        !row.deletedAt &&
        !['COMPLETED', 'CANCELED'].includes(row.status)
      )
        throw new ConflictException(
          'Finish linked projects before completing or canceling an initiative.',
        );
    }
  }
  update(identity: Identity, w: string, id: string, dto: UpdateInitiativeDto) {
    return this.run(identity, w, id, 'manage', async (tx, row, actor) => {
      await this.owner(tx, w, dto.ownerId);
      if (dto.status === 'COMPLETED' || dto.status === 'CANCELED') {
        const links = await tx
          .select()
          .from(initiativeProjects)
          .where(eq(initiativeProjects.initiativeId, id));
        await this.terminalProjects(
          tx,
          w,
          links.map((link) => link.projectId),
        );
      }
      const { expectedRevision, ...patch } = dto;
      const updated = await this.bump(tx, row, expectedRevision, {
        ...patch,
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      });
      await this.fact(tx, w, actor, id, 'updated');
      return updated;
    });
  }
  lifecycle(
    identity: Identity,
    w: string,
    id: string,
    expected: number,
    action: 'archived' | 'deleted' | 'restored',
  ) {
    return this.run(
      identity,
      w,
      id,
      'manage',
      async (tx, row, actor) => {
        if (action === 'archived' && row.deletedAt)
          throw new ConflictException(
            'Restore a deleted initiative before archiving it.',
          );
        if (action === 'restored') {
          await this.owner(tx, w, row.ownerId);
          for (const link of await tx
            .select()
            .from(initiativeProjects)
            .where(eq(initiativeProjects.initiativeId, id))) {
            const { project } = await this.access.projects.require(
              tx,
              identity.userId,
              w,
              link.projectId,
              'read',
            );
            if (project.archivedAt)
              throw new ConflictException(
                'Restore linked projects before restoring the initiative.',
              );
          }
        }
        const updated = await this.bump(
          tx,
          row,
          expected,
          action === 'restored'
            ? { archivedAt: null, deletedAt: null }
            : action === 'archived'
              ? { archivedAt: new Date(), deletedAt: null }
              : { archivedAt: null, deletedAt: new Date() },
        );
        await this.fact(tx, w, actor, id, action);
        return updated;
      },
      true,
    );
  }
  linkedProjects(userId: string, w: string, id: string) {
    return this.db.db.transaction(async (tx) => {
      await this.access.require(tx, userId, w, id);
      return tx
        .select({ association: initiativeProjects, project: projects })
        .from(initiativeProjects)
        .innerJoin(projects, eq(projects.id, initiativeProjects.projectId))
        .where(eq(initiativeProjects.initiativeId, id))
        .orderBy(asc(initiativeProjects.position), asc(initiativeProjects.id));
    });
  }
  link(
    identity: Identity,
    w: string,
    id: string,
    projectId: string,
    expected: number,
    remove = false,
  ) {
    return this.run(
      identity,
      w,
      id,
      'manage',
      async (tx, row, actor) => {
        this.check(row, expected);
        await this.access.projects.require(
          tx,
          identity.userId,
          w,
          projectId,
          remove ? 'read' : 'manage',
          true,
          remove,
        );
        const links = await tx
          .select()
          .from(initiativeProjects)
          .where(eq(initiativeProjects.initiativeId, id));
        const existing = links.find((link) => link.projectId === projectId);
        if (remove) {
          if (!existing)
            throw new NotFoundException('Project association not found.');
          await tx
            .delete(initiativeProjects)
            .where(eq(initiativeProjects.id, existing.id));
        } else {
          if (existing)
            throw new ConflictException('Project is already linked.');
          if (links.length >= 100)
            throw new ConflictException(
              'An initiative supports at most 100 projects.',
            );
          if (['COMPLETED', 'CANCELED'].includes(row.status))
            await this.terminalProjects(tx, w, [projectId]);
          await tx.insert(initiativeProjects).values({
            id: randomUUID(),
            workspaceId: w,
            initiativeId: id,
            projectId,
            position: links.reduce((n, l) => Math.max(n, l.position + 1), 0),
          });
        }
        const updated = await this.bump(tx, row, expected);
        await this.fact(
          tx,
          w,
          actor,
          id,
          remove ? 'project_removed' : 'project_added',
          { project_id: projectId },
        );
        return updated;
      },
      false,
      remove ? 200 : 201,
    );
  }
  reorder(
    identity: Identity,
    w: string,
    id: string,
    ids: string[],
    expected: number,
  ) {
    return this.run(identity, w, id, 'manage', async (tx, row, actor) => {
      this.check(row, expected);
      const links = await tx
        .select()
        .from(initiativeProjects)
        .where(eq(initiativeProjects.initiativeId, id));
      if (
        ids.length !== links.length ||
        new Set(ids).size !== ids.length ||
        links.some((link) => !ids.includes(link.projectId))
      )
        throw new BadRequestException(
          'Reorder must include every linked project exactly once.',
        );
      const offset =
        links.reduce((n, l) => Math.max(n, l.position), 0) + links.length + 1;
      for (let index = 0; index < links.length; index++)
        await tx
          .update(initiativeProjects)
          .set({ position: offset + index, updatedAt: new Date() })
          .where(eq(initiativeProjects.id, links[index]!.id));
      for (let position = 0; position < ids.length; position++)
        await tx
          .update(initiativeProjects)
          .set({ position, updatedAt: new Date() })
          .where(
            and(
              eq(initiativeProjects.initiativeId, id),
              eq(initiativeProjects.projectId, ids[position]!),
            ),
          );
      const updated = await this.bump(tx, row, expected);
      await this.fact(tx, w, actor, id, 'projects_reordered', {
        project_ids: ids,
      });
      return updated;
    });
  }
  progress(userId: string, w: string, id: string) {
    return this.db.db.transaction(async (tx) => {
      const { links } = await this.access.require(tx, userId, w, id);
      const projectRows = [];
      for (const link of links) {
        const { project } = await this.access.projects.require(
          tx,
          userId,
          w,
          link.projectId,
          'read',
          false,
          true,
        );
        if (!project.deletedAt) projectRows.push(project);
      }
      let total = 0,
        completed = 0,
        canceled = 0,
        duplicate = 0,
        estimate = 0,
        completedEstimate = 0;
      for (const project of projectRows) {
        const rows = await tx
          .select({
            category: issueStatuses.category,
            estimate: issues.estimate,
          })
          .from(issues)
          .innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
          .where(
            and(
              eq(issues.projectId, project.id),
              eq(issues.workspaceId, w),
              isNull(issues.deletedAt),
            ),
          );
        for (const issue of rows) {
          total++;
          estimate += issue.estimate ?? 0;
          if (issue.category === 'COMPLETED') {
            completed++;
            completedEstimate += issue.estimate ?? 0;
          }
          if (issue.category === 'CANCELED') canceled++;
          if (issue.category === 'DUPLICATE') duplicate++;
        }
      }
      const eligible = total - canceled - duplicate;
      return {
        initiativeId: id,
        projects: {
          total: projectRows.length,
          completed: projectRows.filter((p) => p.status === 'COMPLETED').length,
          canceled: projectRows.filter((p) => p.status === 'CANCELED').length,
        },
        issues: {
          total,
          completed,
          canceled,
          duplicate,
          remaining: eligible - completed,
        },
        estimates: { total: estimate, completed: completedEstimate },
        completionPercent: eligible
          ? Math.round((completed / eligible) * 100)
          : 0,
      };
    });
  }
  updates(
    userId: string,
    w: string,
    id: string,
    limit: number,
    cursor?: string,
  ) {
    return this.db.db.transaction(async (tx) => {
      await this.access.require(tx, userId, w, id);
      const scope = and(
        eq(initiativeUpdates.workspaceId, w),
        eq(initiativeUpdates.initiativeId, id),
        isNull(initiativeUpdates.deletedAt),
      );
      const [count] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(initiativeUpdates)
        .where(scope);
      const seek = cursor ? decodeCursor(cursor) : undefined;
      const rows = await tx
        .select()
        .from(initiativeUpdates)
        .where(
          and(
            scope,
            seek
              ? sql`(date_trunc('milliseconds',${initiativeUpdates.createdAt}),${initiativeUpdates.id}) < (${seek.createdAt.toISOString()}::timestamptz,${seek.id})`
              : undefined,
          ),
        )
        .orderBy(
          desc(sql`date_trunc('milliseconds',${initiativeUpdates.createdAt})`),
          desc(initiativeUpdates.id),
        )
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      return {
        paginationType: 'cursor',
        items,
        total: count!.total,
        limit,
        cursor: cursor ?? null,
        hasNext: rows.length > limit,
        nextCursor:
          rows.length > limit ? encodeCursor(items[items.length - 1]!) : null,
      };
    });
  }
  publish(identity: Identity, w: string, id: string, dto: InitiativeUpdateDto) {
    return this.run(
      identity,
      w,
      id,
      'manage',
      async (tx, _row, actor) => {
        const [update] = await tx
          .insert(initiativeUpdates)
          .values({
            id: randomUUID(),
            workspaceId: w,
            initiativeId: id,
            authorId: actor,
            body: dto.body.trim(),
            health: dto.health,
          })
          .returning();
        await this.fact(tx, w, actor, id, 'update_published', {
          update_id: update!.id,
        });
        return update!;
      },
      false,
      201,
    );
  }
  editUpdate(
    identity: Identity,
    w: string,
    id: string,
    updateId: string,
    dto: EditInitiativeUpdateDto | { expectedRevision: number },
    remove = false,
  ) {
    return this.run(identity, w, id, 'read', async (tx, _row, actor) => {
      const [update] = await tx
        .select()
        .from(initiativeUpdates)
        .where(
          and(
            eq(initiativeUpdates.workspaceId, w),
            eq(initiativeUpdates.initiativeId, id),
            eq(initiativeUpdates.id, updateId),
          ),
        )
        .limit(1)
        .for('update');
      if (!update || update.deletedAt)
        throw new NotFoundException('Initiative update not found.');
      const { member } = await this.access.workspace.require(
        tx,
        identity.userId,
        w,
        'workspace.read',
      );
      if (
        update.authorId !== actor &&
        !['OWNER', 'ADMIN'].includes(member.role)
      )
        throw new ForbiddenException(
          'Only the author or administrator can modify this update.',
        );
      this.check(update, dto.expectedRevision);
      const patch = remove
        ? { deletedAt: new Date() }
        : {
            body: (dto as EditInitiativeUpdateDto).body.trim(),
            health: (dto as EditInitiativeUpdateDto).health,
          };
      const [row] = await tx
        .update(initiativeUpdates)
        .set({ ...patch, revision: update.revision + 1, updatedAt: new Date() })
        .where(eq(initiativeUpdates.id, updateId))
        .returning();
      await this.fact(
        tx,
        w,
        actor,
        id,
        remove ? 'update_deleted' : 'update_updated',
        { update_id: updateId },
      );
      return row;
    });
  }
  subscribers(
    userId: string,
    w: string,
    id: string,
    limit = 20,
    cursor?: string,
  ) {
    return this.db.db.transaction(async (tx) => {
      await this.access.require(tx, userId, w, id);
      const base = and(
        eq(initiativeSubscribers.workspaceId, w),
        eq(initiativeSubscribers.initiativeId, id),
        sql`EXISTS(SELECT 1 FROM ${memberships} m WHERE m.id=${initiativeSubscribers.membershipId} AND m.workspace_id=${w} AND m.state='ACTIVE' AND m.role<>'GUEST' AND NOT EXISTS(SELECT 1 FROM initiative_projects ip JOIN project_teams pt ON pt.project_id=ip.project_id JOIN teams t ON t.id=pt.team_id WHERE ip.initiative_id=${id} AND t.visibility='PRIVATE' AND NOT EXISTS(SELECT 1 FROM team_memberships tm WHERE tm.team_id=t.id AND tm.membership_id=m.id)))`,
      );
      const [count] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(initiativeSubscribers)
        .where(base);
      const seek = cursor ? decodeCursor(cursor) : undefined;
      const rows = await tx
        .select()
        .from(initiativeSubscribers)
        .where(
          and(
            base,
            seek
              ? sql`(date_trunc('milliseconds',${initiativeSubscribers.createdAt}),${initiativeSubscribers.id}) < (${seek.createdAt.toISOString()}::timestamptz,${seek.id})`
              : undefined,
          ),
        )
        .orderBy(
          desc(
            sql`date_trunc('milliseconds',${initiativeSubscribers.createdAt})`,
          ),
          desc(initiativeSubscribers.id),
        )
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      return {
        paginationType: 'cursor',
        items,
        total: count!.total,
        limit,
        cursor: cursor ?? null,
        hasNext: rows.length > limit,
        nextCursor:
          rows.length > limit ? encodeCursor(items[items.length - 1]!) : null,
      };
    });
  }

  subscribe(identity: Identity, w: string, id: string, remove = false) {
    return this.run(
      identity,
      w,
      id,
      'read',
      async (tx, _row, actor) => {
        const scope = and(
          eq(initiativeSubscribers.initiativeId, id),
          eq(initiativeSubscribers.membershipId, actor),
        );
        const [existing] = await tx
          .select()
          .from(initiativeSubscribers)
          .where(scope)
          .limit(1);
        if (remove) {
          if (!existing) throw new NotFoundException('Subscription not found.');
          await tx.delete(initiativeSubscribers).where(scope);
        } else {
          if (existing) throw new ConflictException('Already subscribed.');
          await tx.insert(initiativeSubscribers).values({
            id: randomUUID(),
            workspaceId: w,
            initiativeId: id,
            membershipId: actor,
          });
        }
        await this.fact(
          tx,
          w,
          actor,
          id,
          remove ? 'unsubscribed' : 'subscribed',
          { membership_id: actor },
        );
        return { membershipId: actor, subscribed: !remove };
      },
      false,
      remove ? 200 : 201,
    );
  }
}
