import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../database/database.service';
import {
  favorites,
  issueStatuses,
  projectStatuses,
  labels,
  memberships,
} from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { TeamAccessService } from '../../teams/application/team-access.service';
import { ProjectAccessService } from '../../projects/application/project-access.service';
import { IssueAccessService } from '../../issues/application/issue-access.service';
import { InitiativeAccessService } from '../../initiatives/application/initiative-access.service';
import { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import { EventWriter } from '../../eventing/application/event-writer.service';
import { AuditWriter } from '../../audit/application/audit-writer.service';
import {
  canManageView,
  validateDisplay,
  validateFilter,
  ViewFilterError,
  type ViewFilter,
  type ViewResource,
} from '../domain/view-filter';
import { ViewRepository } from '../infrastructure/view.repository';
import { ResourceQueryRepository } from '../infrastructure/resource-query.repository';
import {
  decodeQueryCursor,
  encodeQueryCursor,
  queryScope,
} from '../infrastructure/query-cursor';
import type {
  CreateFavoriteDto,
  CreateViewDto,
  QueryViewDto,
  ReorderFavoritesDto,
  SearchDto,
  UpdateViewDto,
  ViewListDto,
} from '../presentation/view.dto';
type Member = typeof memberships.$inferSelect;
@Injectable()
export class ViewService {
  constructor(
    private readonly db: DatabaseService,
    private readonly repository: ViewRepository,
    private readonly queries: ResourceQueryRepository,
    private readonly workspace: WorkspaceAuthorizationService,
    private readonly teams: TeamAccessService,
    private readonly projects: ProjectAccessService,
    private readonly issues: IssueAccessService,
    private readonly initiatives: InitiativeAccessService,
    private readonly commands: CommandBus,
    private readonly events: EventWriter,
    private readonly audit: AuditWriter,
  ) {}
  list(userId: string, w: string, query: ViewListDto) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.workspace.require(
        tx,
        userId,
        w,
        'workspace.read',
      );
      const scope = queryScope([
        w,
        member.id,
        'views',
        query.resource ?? null,
        query.lifecycle,
      ]);
      const result = await this.repository.list(
        tx,
        w,
        member.id,
        member.role === 'GUEST',
        query,
        query.cursor
          ? decodeQueryCursor(query.cursor, scope, 'CREATED_DESC')
          : undefined,
      );
      const items = result.rows.slice(0, query.limit);
      return this.page(
        items,
        result.rows.length,
        result.total,
        query.limit,
        query.cursor,
        items.at(-1)
          ? {
              scope,
              sort: 'CREATED_DESC',
              position: items.at(-1)!.createdAt.toISOString(),
              id: items.at(-1)!.id,
              kind: 'view',
            }
          : undefined,
      );
    });
  }
  get(userId: string, w: string, id: string) {
    return this.db.db.transaction(
      async (tx) => (await this.requireView(tx, userId, w, id)).view,
    );
  }
  create(identity: Identity, w: string, dto: CreateViewDto) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { member } = await this.workspace.require(
          tx,
          identity.userId,
          w,
          'workspace.read',
        );
        const config = await this.configuration(
          tx,
          identity.userId,
          w,
          member,
          dto.resource,
          dto,
        );
        const view = await this.repository.create(tx, {
          id: randomUUID(),
          workspaceId: w,
          ownerId: member.id,
          name: dto.name.trim(),
          description: dto.description ?? null,
          resource: dto.resource,
          visibility: dto.visibility ?? 'PRIVATE',
          teamId: dto.teamId ?? null,
          projectId: dto.projectId ?? null,
          filters: { ...config.filters },
          display: { ...config.display },
        });
        await this.fact(tx, w, member.id, 'view', view.id, 'view.created', {
          view_id: view.id,
          resource: view.resource,
        });
        return { id: view.id, revision: view.revision };
      },
      {
        statusCode: 201,
        authorize: async (tx) => {
          const { member } = await this.workspace.require(
            tx,
            identity.userId,
            w,
            'workspace.read',
            { lock: true },
          );
          await this.configuration(
            tx,
            identity.userId,
            w,
            member,
            dto.resource,
            dto,
          );
        },
      },
    );
  }
  update(identity: Identity, w: string, id: string, dto: UpdateViewDto) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { view, member } = await this.requireView(
          tx,
          identity.userId,
          w,
          id,
          'manage',
        );
        this.revision(view.revision, dto.expectedRevision);
        const merged = { ...view, ...dto };
        const config = await this.configuration(
          tx,
          identity.userId,
          w,
          member,
          view.resource,
          merged,
        );
        const changed = Object.keys(dto).filter(
          (key) => key !== 'expectedRevision',
        );
        if (!changed.length)
          throw new BadRequestException('No view changes supplied.');
        const patch: Partial<typeof view> = {
          filters: { ...config.filters },
          display: { ...config.display },
        };
        for (const key of [
          'name',
          'description',
          'visibility',
          'teamId',
          'projectId',
        ] as const)
          if (dto[key] !== undefined) Object.assign(patch, { [key]: dto[key] });
        if (patch.name !== undefined) patch.name = patch.name.trim();
        const updated = await this.repository.patch(tx, view, patch);
        await this.fact(tx, w, member.id, 'view', id, 'view.updated', {
          view_id: id,
          changed_fields: changed.map((key) =>
            key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()),
          ),
        });
        return { id, revision: updated.revision };
      },
      {
        authorize: async (tx) => {
          const { view, member } = await this.requireView(
            tx,
            identity.userId,
            w,
            id,
            'manage',
            true,
          );
          await this.configuration(
            tx,
            identity.userId,
            w,
            member,
            view.resource,
            { ...view, ...dto },
          );
        },
      },
    );
  }
  lifecycle(
    identity: Identity,
    w: string,
    id: string,
    expectedRevision: number,
    action: 'archive' | 'delete' | 'restore',
  ) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { view, member } = await this.requireView(
          tx,
          identity.userId,
          w,
          id,
          'manage',
          false,
          true,
        );
        this.revision(view.revision, expectedRevision);
        const patch =
          action === 'archive'
            ? { archivedAt: new Date(), deletedAt: null }
            : action === 'delete'
              ? { deletedAt: new Date(), archivedAt: null }
              : { deletedAt: null, archivedAt: null };
        if (action === 'archive' && view.deletedAt)
          throw new ConflictException(
            'Restore the trashed view before archiving.',
          );
        const updated = await this.repository.patch(tx, view, patch);
        const event =
          action === 'archive'
            ? 'view.archived'
            : action === 'delete'
              ? 'view.deleted'
              : 'view.restored';
        await this.fact(tx, w, member.id, 'view', id, event, { view_id: id });
        return { id, revision: updated.revision };
      },
      {
        authorize: async (tx) => {
          await this.requireView(
            tx,
            identity.userId,
            w,
            id,
            'manage',
            true,
            true,
          );
        },
      },
    );
  }
  query(userId: string, w: string, dto: QueryViewDto) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.workspace.require(
        tx,
        userId,
        w,
        'workspace.read',
      );
      const filter = this.filter(dto.resource, dto.filters);
      await this.references(tx, userId, w, member, dto.resource, filter);
      return this.executeQuery(
        tx,
        w,
        member,
        dto.resource,
        filter,
        dto.limit,
        dto.cursor,
      );
    });
  }
  querySaved(
    userId: string,
    w: string,
    id: string,
    limit: number,
    cursor?: string,
  ) {
    return this.db.db.transaction(async (tx) => {
      const { view, member } = await this.requireView(tx, userId, w, id);
      if (view.archivedAt)
        throw new ConflictException('Saved view is archived.');
      const filter = this.filter(view.resource, view.filters);
      await this.references(tx, userId, w, member, view.resource, filter);
      if (view.teamId) filter.teamId = view.teamId;
      if (view.projectId) filter.projectId = view.projectId;
      return this.executeQuery(
        tx,
        w,
        member,
        view.resource,
        filter,
        limit,
        cursor,
      );
    });
  }
  search(userId: string, w: string, dto: SearchDto) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.workspace.require(
        tx,
        userId,
        w,
        'workspace.read',
      );
      const filter = this.filter('ISSUES', { version: 1, text: dto.q });
      return this.executeQuery(
        tx,
        w,
        member,
        dto.resource,
        filter,
        dto.limit,
        dto.cursor,
      );
    });
  }
  favorites(userId: string, w: string, limit: number, cursor?: string) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.workspace.require(
        tx,
        userId,
        w,
        'preferences.update',
      );
      const scope = queryScope([w, member.id, 'favorites']);
      const result = await this.repository.listFavorites(
        tx,
        w,
        member.id,
        member.role === 'GUEST',
        limit,
        cursor ? decodeQueryCursor(cursor, scope, 'POSITION_ASC') : undefined,
      );
      const items = result.rows.slice(0, limit);
      return this.page(
        items,
        result.rows.length,
        result.total,
        limit,
        cursor,
        items.at(-1)
          ? {
              scope,
              sort: 'POSITION_ASC',
              position: String(items.at(-1)!.position),
              id: items.at(-1)!.id,
              kind: 'favorite',
            }
          : undefined,
      );
    });
  }
  addFavorite(identity: Identity, w: string, dto: CreateFavoriteDto) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { member } = await this.workspace.require(
          tx,
          identity.userId,
          w,
          'preferences.update',
        );
        const own = await this.repository.ownFavorites(tx, w, member.id);
        const column:
          'issueId' | 'projectId' | 'teamId' | 'initiativeId' | 'viewId' =
          `${dto.targetType}Id`;
        const duplicate = own.find((row) => row[column] === dto.targetId);
        if (duplicate)
          return { id: duplicate.id, revision: duplicate.revision };
        if (own.length >= 200)
          throw new ConflictException('Favorite limit reached.');
        const [row] = await tx
          .insert(favorites)
          .values({
            id: randomUUID(),
            workspaceId: w,
            membershipId: member.id,
            position: own.length
              ? Math.max(...own.map((row) => row.position)) + 1
              : 0,
            [column]: dto.targetId,
          })
          .returning();
        await this.fact(
          tx,
          w,
          member.id,
          'favorite',
          row!.id,
          'favorite.added',
          {
            favorite_id: row!.id,
            membership_id: member.id,
            target_type: dto.targetType,
            target_id: dto.targetId,
          },
        );
        return { id: row!.id, revision: row!.revision };
      },
      {
        statusCode: 201,
        authorize: async (tx) => {
          await this.workspace.require(
            tx,
            identity.userId,
            w,
            'preferences.update',
            { lock: true },
          );
          await this.target(tx, identity.userId, w, dto);
        },
      },
    );
  }
  reorderFavorites(identity: Identity, w: string, dto: ReorderFavoritesDto) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { member } = await this.workspace.require(
          tx,
          identity.userId,
          w,
          'preferences.update',
        );
        const own = await this.repository.ownFavorites(tx, w, member.id);
        const ids = dto.items.map((item) => item.id);
        if (
          own.length !== ids.length ||
          new Set(ids).size !== ids.length ||
          own.some((row) => !ids.includes(row.id))
        )
          throw new BadRequestException('Supply every favorite exactly once.');
        for (const item of dto.items)
          this.revision(
            own.find((row) => row.id === item.id)!.revision,
            item.expectedRevision,
          );
        for (const [index, item] of dto.items.entries())
          await tx
            .update(favorites)
            .set({
              position: index,
              revision: item.expectedRevision + 1,
              updatedAt: new Date(),
            })
            .where(eq(favorites.id, item.id));
        await this.fact(
          tx,
          w,
          member.id,
          'membership',
          member.id,
          'favorite.reordered',
          { membership_id: member.id, favorite_ids: ids },
        );
        return { favoriteIds: ids };
      },
      {
        authorize: async (tx) => {
          await this.workspace.require(
            tx,
            identity.userId,
            w,
            'preferences.update',
            { lock: true },
          );
        },
      },
    );
  }
  removeFavorite(
    identity: Identity,
    w: string,
    id: string,
    expectedRevision: number,
  ) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { member } = await this.workspace.require(
          tx,
          identity.userId,
          w,
          'preferences.update',
        );
        const favorite = await this.repository.favorite(tx, w, member.id, id);
        if (!favorite) throw new NotFoundException('Favorite not found.');
        this.revision(favorite.revision, expectedRevision);
        await tx.delete(favorites).where(eq(favorites.id, id));
        const column = (
          ['issueId', 'projectId', 'teamId', 'initiativeId', 'viewId'] as const
        ).find((key) => favorite[key] !== null)!;
        await this.fact(tx, w, member.id, 'favorite', id, 'favorite.removed', {
          favorite_id: id,
          membership_id: member.id,
          target_type: column.slice(0, -2),
          target_id: favorite[column],
        });
        return { id, removed: true };
      },
      {
        authorize: async (tx) => {
          await this.workspace.require(
            tx,
            identity.userId,
            w,
            'preferences.update',
            { lock: true },
          );
        },
      },
    );
  }
  private async requireView(
    tx: Tx,
    userId: string,
    w: string,
    id: string,
    mode: 'read' | 'manage' = 'read',
    lock = false,
    allowInactive = false,
  ) {
    const { member } = await this.workspace.require(
      tx,
      userId,
      w,
      'workspace.read',
      { lock },
    );
    const view = await this.repository.get(tx, w, id, lock);
    if (
      !view ||
      (view.deletedAt && !allowInactive) ||
      !(await this.repository.visible(
        tx,
        w,
        id,
        member.id,
        member.role === 'GUEST',
      ))
    )
      throw new NotFoundException('Saved view not found.');
    if (mode === 'manage') {
      if (!canManageView(member.role, member.id, view.ownerId, view.visibility))
        throw new ForbiddenException('Saved view permission denied.');
      if (!allowInactive && view.archivedAt)
        throw new ConflictException('Saved view is archived.');
    }
    return { view, member };
  }
  private filter(resource: ViewResource, value: unknown) {
    try {
      return validateFilter(resource, value);
    } catch (error) {
      if (error instanceof ViewFilterError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }
  private async configuration(
    tx: Tx,
    userId: string,
    w: string,
    member: Member,
    resource: ViewResource,
    dto: {
      teamId?: string | null;
      projectId?: string | null;
      filters: unknown;
      display?: unknown;
      visibility?: string;
    },
  ) {
    if (member.role === 'GUEST' && dto.visibility === 'WORKSPACE')
      throw new ForbiddenException('Guests can create only private views.');
    const filters = this.filter(resource, dto.filters);
    let display;
    try {
      display = validateDisplay(resource, dto.display ?? {});
    } catch (error) {
      if (error instanceof ViewFilterError)
        throw new BadRequestException(error.message);
      throw error;
    }
    if (resource === 'PROJECTS' && dto.projectId)
      throw new BadRequestException(
        'Project scopes apply only to issue views.',
      );
    if (
      (dto.teamId && filters.teamId && dto.teamId !== filters.teamId) ||
      (dto.projectId &&
        filters.projectId &&
        dto.projectId !== filters.projectId)
    )
      throw new BadRequestException(
        'Saved view scopes conflict with its filters.',
      );
    await this.references(tx, userId, w, member, resource, {
      ...filters,
      ...(dto.teamId ? { teamId: dto.teamId } : {}),
      ...(dto.projectId ? { projectId: dto.projectId } : {}),
    });
    return { filters, display };
  }
  private async references(
    tx: Tx,
    userId: string,
    w: string,
    member: Member,
    resource: ViewResource,
    filter: ViewFilter,
  ) {
    if (resource === 'PROJECTS' && member.role === 'GUEST')
      throw new ForbiddenException('Project views are unavailable to guests.');
    if (filter.teamId) await this.teams.require(tx, userId, w, filter.teamId);
    if (filter.projectId) {
      const { project } = await this.projects.require(
        tx,
        userId,
        w,
        filter.projectId,
      );
      if (project.archivedAt || project.deletedAt)
        throw new ConflictException('Project filter is inactive.');
    }
    if (filter.statusId) {
      if (resource === 'ISSUES') {
        const [status] = await tx
          .select()
          .from(issueStatuses)
          .where(eq(issueStatuses.id, filter.statusId));
        if (!status || status.retiredAt)
          throw new NotFoundException('Status filter not found.');
        await this.teams.require(tx, userId, w, status.teamId);
        if (filter.teamId && status.teamId !== filter.teamId)
          throw new BadRequestException(
            'Status does not belong to the selected team.',
          );
      } else {
        const [status] = await tx
          .select()
          .from(projectStatuses)
          .where(
            and(
              eq(projectStatuses.id, filter.statusId),
              eq(projectStatuses.workspaceId, w),
              isNull(projectStatuses.archivedAt),
            ),
          );
        if (!status) throw new NotFoundException('Status filter not found.');
      }
    }
    if (filter.labelId) {
      const [label] = await tx
        .select()
        .from(labels)
        .where(
          and(
            eq(labels.id, filter.labelId),
            eq(labels.workspaceId, w),
            isNull(labels.archivedAt),
          ),
        );
      if (!label) throw new NotFoundException('Label filter not found.');
      if (label.teamId) {
        await this.teams.require(tx, userId, w, label.teamId);
        if (filter.teamId && filter.teamId !== label.teamId)
          throw new BadRequestException(
            'Label does not belong to the selected team.',
          );
      }
    }
    if (filter.assigneeId) {
      if (member.role === 'GUEST' && filter.assigneeId !== member.id)
        throw new ForbiddenException(
          'Guest assignee filters are limited to themselves.',
        );
      const [assignee] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.id, filter.assigneeId),
            eq(memberships.workspaceId, w),
            eq(memberships.state, 'ACTIVE'),
          ),
        );
      if (!assignee) throw new NotFoundException('Assignee filter not found.');
    }
  }
  private async target(
    tx: Tx,
    userId: string,
    w: string,
    target: CreateFavoriteDto,
  ) {
    if (target.targetType === 'issue') {
      const { issue } = await this.issues.require(
        tx,
        userId,
        w,
        target.targetId,
      );
      if (issue.deletedAt)
        throw new NotFoundException('Favorite target not found.');
    } else if (target.targetType === 'project') {
      const { project } = await this.projects.require(
        tx,
        userId,
        w,
        target.targetId,
        'read',
        false,
        true,
      );
      if (project.deletedAt)
        throw new NotFoundException('Favorite target not found.');
    } else if (target.targetType === 'team')
      await this.teams.require(
        tx,
        userId,
        w,
        target.targetId,
        'read',
        false,
        true,
      );
    else if (target.targetType === 'initiative') {
      const { initiative } = await this.initiatives.require(
        tx,
        userId,
        w,
        target.targetId,
        'read',
        false,
        true,
      );
      if (initiative.deletedAt)
        throw new NotFoundException('Favorite target not found.');
    } else await this.requireView(tx, userId, w, target.targetId);
  }
  private async executeQuery(
    tx: Tx,
    w: string,
    member: Member,
    resource: ViewResource | 'ALL' | 'DOCUMENTS',
    filter: ViewFilter,
    limit: number,
    cursor?: string,
  ) {
    const scope = queryScope([w, member.id, resource, filter]);
    const result = await this.queries.query(
      tx,
      w,
      member.id,
      member.role === 'GUEST',
      resource,
      filter,
      limit,
      cursor ? decodeQueryCursor(cursor, scope, filter.sort) : undefined,
    );
    const items = result.rows.slice(0, limit);
    const last = items.at(-1);
    return this.page(
      items,
      result.rows.length,
      result.total,
      limit,
      cursor,
      last
        ? {
            scope,
            sort: filter.sort,
            position: last.position,
            id: last.id,
            kind: last.kind,
          }
        : undefined,
    );
  }
  private page<T>(
    items: T[],
    rowCount: number,
    total: number,
    limit: number,
    cursor: string | undefined,
    next:
      | {
          scope: string;
          sort: string;
          position: string;
          id: string;
          kind: string;
        }
      | undefined,
  ) {
    return {
      paginationType: 'cursor',
      items,
      total,
      limit,
      cursor: cursor ?? null,
      hasNext: rowCount > limit,
      nextCursor:
        rowCount > limit && next ? encodeQueryCursor({ v: 1, ...next }) : null,
    };
  }
  private revision(actual: number, expected: number) {
    if (actual !== expected)
      throw new ConflictException('Resource revision is stale.');
  }
  private async fact(
    tx: Tx,
    w: string,
    actorId: string,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    await this.events.append(tx, {
      workspaceId: w,
      actorId,
      aggregateType,
      aggregateId,
      eventType,
      payload,
    });
    await this.audit.append(tx, {
      workspaceId: w,
      actorId,
      action: eventType,
      targetType: aggregateType,
      targetId: aggregateId,
      metadata: payload,
    });
  }
}
