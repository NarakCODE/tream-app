import { createsDependencyCycle } from '../domain/issue-graph';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  issues,
  issueStatuses,
  cycles,
  projectMilestones,
  teamMemberships,
  issueRelations,
  issueLabels,
  labels,
} from '../../../database/schema';
import { DatabaseService } from '../../../database/database.service';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { TeamAccessService } from '../../teams/application/team-access.service';
import { TeamIssueNumberAllocator } from '../../teams/application/team-issue-number-allocator';
import { ProjectAccessService } from '../../projects/application/project-access.service';
import {
  IssueRepository,
  type Issue,
} from '../infrastructure/issue.repository';
import { IssueAccessService } from './issue-access.service';
import { IssueMutationService } from './issue-mutation.service';
import type {
  CreateIssueDto,
  UpdateIssueDto,
  TransferIssueDto,
  IssueListDto,
  RelationDto,
} from '../presentation/issue.dto';
@Injectable()
export class IssueService {
  constructor(
    private readonly db: DatabaseService,
    private readonly repository: IssueRepository,
    private readonly access: IssueAccessService,
    private readonly mutation: IssueMutationService,
    private readonly workspace: WorkspaceAuthorizationService,
    private readonly teams: TeamAccessService,
    private readonly allocator: TeamIssueNumberAllocator,
    private readonly projects: ProjectAccessService,
    private readonly commands: CommandBus,
  ) {}
  list(userId: string, workspaceId: string, query: IssueListDto) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.workspace.require(
        tx,
        userId,
        workspaceId,
        'workspace.read',
      );
      if (query.teamId)
        await this.teams.require(
          tx,
          userId,
          workspaceId,
          query.teamId,
          'read',
          false,
          true,
        );
      const { rows, total } = await this.repository.list(
        tx,
        workspaceId,
        member.id,
        member.role === 'GUEST',
        query,
        query.cursor ? decodeCursor(query.cursor) : undefined,
      );
      const items = rows.slice(0, query.limit);
      return {
        paginationType: 'cursor',
        cursor: query.cursor ?? null,
        limit: query.limit,
        total,
        hasNext: rows.length > query.limit,
        items,
        nextCursor:
          rows.length > query.limit
            ? encodeCursor(items[items.length - 1]!)
            : null,
      };
    });
  }
  get(userId: string, workspaceId: string, id: string) {
    return this.db.db.transaction(
      async (tx) =>
        (await this.access.require(tx, userId, workspaceId, id)).issue,
    );
  }
  lookup(userId: string, workspaceId: string, identifier: string) {
    return this.db.db.transaction(async (tx) => {
      await this.workspace.require(tx, userId, workspaceId, 'workspace.read');
      const alias = await this.repository.identifier(
        tx,
        workspaceId,
        identifier,
      );
      if (!alias) throw new NotFoundException('Issue not found.');
      return {
        ...(
          await this.access.require(
            tx,
            userId,
            workspaceId,
            alias.issueId,
            'read',
            false,
            true,
          )
        ).issue,
        resolvedIdentifier: identifier,
      };
    });
  }
  async validate(
    tx: Tx,
    userId: string,
    workspaceId: string,
    value: typeof issues.$inferInsert,
    issueId?: string,
    previous?: Issue,
  ) {
    const { team } = await this.teams.require(
      tx,
      userId,
      workspaceId,
      value.teamId,
      'write',
      true,
    );
    const [status] = await tx
      .select()
      .from(issueStatuses)
      .where(
        and(
          eq(issueStatuses.id, value.statusId),
          eq(issueStatuses.teamId, value.teamId),
          isNull(issueStatuses.retiredAt),
        ),
      );
    if (!status) throw new NotFoundException('Active issue status not found.');
    if (value.assigneeId && value.assigneeId !== previous?.assigneeId) {
      const member = await this.repository.member(
        tx,
        workspaceId,
        value.assigneeId,
      );
      if (!member || member.state !== 'ACTIVE' || member.role === 'GUEST')
        throw new ConflictException(
          'Assignee must be an active non-guest workspace member.',
        );
      if (team.visibility === 'PRIVATE') {
        const [share] = await tx
          .select()
          .from(teamMemberships)
          .where(
            and(
              eq(teamMemberships.teamId, team.id),
              eq(teamMemberships.membershipId, member.id),
            ),
          );
        if (!share)
          throw new ConflictException(
            'Assignee must have private team access.',
          );
      }
    }
    if (value.projectId) {
      const { project, links } = await this.projects.require(
        tx,
        userId,
        workspaceId,
        value.projectId,
        'read',
        true,
      );
      if (
        project.archivedAt ||
        project.deletedAt ||
        !links.some((x) => x.teamId === value.teamId)
      )
        throw new ConflictException(
          'Project must be active and linked to the issue team.',
        );
      if (
        ['COMPLETED', 'CANCELED'].includes(project.status) &&
        !['COMPLETED', 'CANCELED', 'DUPLICATE'].includes(status.category)
      )
        throw new ConflictException(
          'Closed projects cannot receive unfinished issues.',
        );
    }
    if (value.milestoneId) {
      if (!value.projectId)
        throw new BadRequestException('Milestone requires a project.');
      const [milestone] = await tx
        .select()
        .from(projectMilestones)
        .where(
          and(
            eq(projectMilestones.workspaceId, workspaceId),
            eq(projectMilestones.projectId, value.projectId),
            eq(projectMilestones.id, value.milestoneId),
          ),
        );
      if (!milestone) throw new NotFoundException('Milestone not found.');
    }
    if (value.cycleId && value.cycleId !== previous?.cycleId) {
      const [cycle] = await tx
        .select()
        .from(cycles)
        .where(
          and(eq(cycles.id, value.cycleId), eq(cycles.teamId, value.teamId)),
        );
      if (
        !team.cyclesEnabled ||
        !cycle ||
        cycle.completedAt ||
        cycle.canceledAt
      )
        throw new ConflictException(
          'Cycle must be enabled, open and belong to the issue team.',
        );
    }
    if (value.parentId) {
      const { issue: parentIssue } = await this.access.require(
        tx,
        userId,
        workspaceId,
        value.parentId,
        'read',
        true,
      );
      if (
        value.parentId !== previous?.parentId &&
        (parentIssue.archivedAt || parentIssue.deletedAt)
      )
        throw new ConflictException('Parent issue must be active.');
      if (value.parentId === issueId)
        throw new ConflictException('Issue cannot parent itself.');
      let next: string | null = value.parentId;
      const seen = new Set<string>();
      while (next) {
        if (next === issueId || seen.has(next))
          throw new ConflictException('Issue hierarchy cycle.');
        seen.add(next);
        const parent = await this.repository.find(tx, workspaceId, next);
        next = parent?.parentId ?? null;
      }
    }
  }
  create(identity: Identity, workspaceId: string, dto: CreateIssueDto) {
    return this.commands.execute(
      identity,
      (tx) => this.createInTransaction(tx, identity.userId, workspaceId, dto),
      {
        statusCode: 201,
        authorize: async (tx) => {
          await this.teams.require(
            tx,
            identity.userId,
            workspaceId,
            dto.teamId,
            'write',
            true,
          );
          if (dto.projectId)
            await this.projects.require(
              tx,
              identity.userId,
              workspaceId,
              dto.projectId,
              'read',
              true,
              true,
            );
          if (dto.parentId)
            await this.access.require(
              tx,
              identity.userId,
              workspaceId,
              dto.parentId,
              'read',
              true,
              true,
            );
        },
      },
    );
  }
  async createInTransaction(
    tx: Tx,
    userId: string,
    workspaceId: string,
    dto: CreateIssueDto,
  ) {
    const { member } = await this.teams.require(
      tx,
      userId,
      workspaceId,
      dto.teamId,
      'write',
      true,
    );
    const allocated = await this.allocator.allocate(
      tx,
      userId,
      workspaceId,
      dto.teamId,
    );
    const value: typeof issues.$inferInsert = {
      ...dto,
      id: randomUUID(),
      workspaceId,
      createdById: member.id,
      number: allocated.number,
      identifier: allocated.identifier,
      statusId: dto.statusId ?? allocated.defaultStatusId,
      title: dto.title.trim(),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
    };
    await this.validate(tx, userId, workspaceId, value);
    const [issue] = await tx.insert(issues).values(value).returning();
    await this.mutation.fact(
      tx,
      workspaceId,
      member.id,
      issue!.id,
      'issue.created',
      {
        issue_id: issue!.id,
        identifier: issue!.identifier,
        team_id: issue!.teamId,
        status_id: issue!.statusId,
        project_id: issue!.projectId,
        cycle_id: issue!.cycleId,
        assignee_membership_id: issue!.assigneeId,
      },
    );
    return issue!;
  }
  private execute<T>(
    identity: Identity,
    workspaceId: string,
    id: string,
    handler: (tx: Tx, issue: Issue, actorId: string) => Promise<T>,
    allowInactive = false,
    additionalAuthorize?: (tx: Tx) => Promise<void>,
  ) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { issue, member } = await this.access.require(
          tx,
          identity.userId,
          workspaceId,
          id,
          'write',
          true,
          allowInactive,
        );
        return handler(tx, issue, member.id);
      },
      {
        authorize: async (tx) => {
          await this.access.require(
            tx,
            identity.userId,
            workspaceId,
            id,
            'write',
            true,
            allowInactive,
          );
          await additionalAuthorize?.(tx);
        },
      },
    );
  }
  update(
    identity: Identity,
    workspaceId: string,
    id: string,
    dto: UpdateIssueDto,
  ) {
    return this.execute(
      identity,
      workspaceId,
      id,
      async (tx, issue, actor) => {
        const { expectedRevision, ...fields } = dto;
        if (!Object.keys(fields).length)
          throw new BadRequestException(
            'At least one issue field is required.',
          );
        const { dueDate, ...otherFields } = fields;
        const patch = {
          ...otherFields,
          ...(fields.title !== undefined ? { title: fields.title.trim() } : {}),
          ...(dueDate !== undefined
            ? { dueDate: dueDate ? new Date(dueDate) : null }
            : {}),
        };
        const merged = { ...issue, ...patch };
        await this.validate(
          tx,
          identity.userId,
          workspaceId,
          merged,
          id,
          issue,
        );
        const updated = await this.mutation.bump(
          tx,
          issue,
          expectedRevision,
          patch,
        );
        await this.mutation.fact(tx, workspaceId, actor, id, 'issue.updated', {
          issue_id: id,
          changed_fields: Object.keys(fields).map((x) =>
            x === 'assigneeId'
              ? 'assignee_membership_id'
              : x === 'parentId'
                ? 'parent_issue_id'
                : x.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()),
          ),
        });
        if (fields.statusId && fields.statusId !== issue.statusId)
          await this.mutation.fact(
            tx,
            workspaceId,
            actor,
            id,
            'issue.status_changed',
            {
              issue_id: id,
              previous_status_id: issue.statusId,
              status_id: fields.statusId,
            },
          );
        if (
          fields.assigneeId !== undefined &&
          fields.assigneeId !== issue.assigneeId
        )
          await this.mutation.fact(
            tx,
            workspaceId,
            actor,
            id,
            'issue.assigned',
            {
              issue_id: id,
              previous_assignee_membership_id: issue.assigneeId,
              assignee_membership_id: updated.assigneeId,
            },
          );
        if (fields.cycleId !== undefined && fields.cycleId !== issue.cycleId)
          await this.mutation.fact(
            tx,
            workspaceId,
            actor,
            id,
            'issue.cycle_changed',
            {
              issue_id: id,
              previous_cycle_id: issue.cycleId,
              cycle_id: updated.cycleId,
            },
          );
        return updated;
      },
      false,
      async (tx) => {
        if (dto.projectId)
          await this.projects.require(
            tx,
            identity.userId,
            workspaceId,
            dto.projectId,
            'read',
            true,
            true,
          );
        if (dto.parentId)
          await this.access.require(
            tx,
            identity.userId,
            workspaceId,
            dto.parentId,
            'read',
            true,
            true,
          );
      },
    );
  }
  lifecycle(
    identity: Identity,
    workspaceId: string,
    id: string,
    action: 'archive' | 'delete' | 'restore',
    expectedRevision: number,
  ) {
    return this.execute(
      identity,
      workspaceId,
      id,
      async (tx, issue, actor) => {
        if (action !== 'restore' && (issue.archivedAt || issue.deletedAt))
          throw new ConflictException('Issue is already inactive.');
        const now = new Date();
        const patch =
          action === 'restore'
            ? { archivedAt: null, deletedAt: null }
            : action === 'archive'
              ? { archivedAt: now, deletedAt: null }
              : { archivedAt: null, deletedAt: now };
        if (action === 'restore')
          await this.validate(
            tx,
            identity.userId,
            workspaceId,
            { ...issue, ...patch },
            id,
          );
        const result = await this.mutation.bump(
          tx,
          issue,
          expectedRevision,
          patch,
        );
        await this.mutation.fact(
          tx,
          workspaceId,
          actor,
          id,
          action === 'delete'
            ? 'issue.deleted'
            : action === 'archive'
              ? 'issue.archived'
              : 'issue.restored',
          {
            issue_id: id,
            ...(action === 'delete'
              ? { deleted_at: now.toISOString() }
              : action === 'archive'
                ? { archived_at: now.toISOString() }
                : { restored_at: now.toISOString() }),
          },
        );
        return result;
      },
      true,
    );
  }
  transfer(
    identity: Identity,
    workspaceId: string,
    id: string,
    dto: TransferIssueDto,
  ) {
    return this.execute(identity, workspaceId, id, async (tx, issue, actor) => {
      if (dto.teamId === issue.teamId)
        throw new ConflictException('Destination team must differ.');
      await this.teams.require(
        tx,
        identity.userId,
        workspaceId,
        dto.teamId,
        'write',
        true,
      );
      const allocated = await this.allocator.allocate(
        tx,
        identity.userId,
        workspaceId,
        dto.teamId,
      );
      let statusId = dto.statusId;
      if (!statusId) {
        const [old] = await tx
          .select()
          .from(issueStatuses)
          .where(eq(issueStatuses.id, issue.statusId));
        const options = await tx
          .select()
          .from(issueStatuses)
          .where(
            and(
              eq(issueStatuses.teamId, dto.teamId),
              isNull(issueStatuses.retiredAt),
            ),
          );
        statusId =
          options
            .filter((x) => x.category === old?.category)
            .sort(
              (a, b) => a.position - b.position || a.id.localeCompare(b.id),
            )[0]?.id ?? allocated.defaultStatusId;
      }
      const patch = {
        teamId: dto.teamId,
        number: allocated.number,
        identifier: allocated.identifier,
        statusId,
        projectId: dto.projectId ?? null,
        milestoneId: dto.milestoneId ?? null,
        cycleId: dto.cycleId ?? null,
      };
      await this.validate(
        tx,
        identity.userId,
        workspaceId,
        { ...issue, ...patch },
        id,
      );
      const removedLabels = await tx
        .delete(issueLabels)
        .where(
          and(
            eq(issueLabels.issueId, id),
            sql`${issueLabels.labelId} IN (SELECT id FROM ${labels} WHERE team_id IS NOT NULL AND team_id<>${dto.teamId})`,
          ),
        )
        .returning();
      for (const label of removedLabels)
        await this.mutation.fact(
          tx,
          workspaceId,
          actor,
          id,
          'issue.label_removed',
          { issue_id: id, label_id: label.labelId },
        );
      const result = await this.mutation.bump(
        tx,
        issue,
        dto.expectedRevision,
        patch,
      );
      await this.mutation.fact(
        tx,
        workspaceId,
        actor,
        id,
        'issue.transferred',
        {
          issue_id: id,
          previous_team_id: issue.teamId,
          team_id: dto.teamId,
          previous_identifier: issue.identifier,
          identifier: result.identifier,
          status_id: result.statusId,
          project_id: result.projectId,
          cycle_id: result.cycleId,
        },
      );
      return result;
    });
  }
  relations(userId: string, workspaceId: string, id: string) {
    return this.db.db.transaction(async (tx) => {
      await this.access.require(tx, userId, workspaceId, id);
      const rows = await tx
        .select()
        .from(issueRelations)
        .where(
          sql`${issueRelations.sourceIssueId}=${id} OR ${issueRelations.targetIssueId}=${id}`,
        );
      const visible = [];
      for (const row of rows) {
        try {
          await this.access.require(
            tx,
            userId,
            workspaceId,
            row.sourceIssueId === id ? row.targetIssueId : row.sourceIssueId,
          );
          visible.push(row);
        } catch (error) {
          if (
            !(error instanceof NotFoundException) &&
            !(error instanceof ForbiddenException)
          )
            throw error;
        }
      }
      return visible;
    });
  }
  addRelation(
    identity: Identity,
    workspaceId: string,
    id: string,
    dto: RelationDto,
  ) {
    return this.execute(
      identity,
      workspaceId,
      id,
      async (tx, issue, actor) => {
        await this.access.require(
          tx,
          identity.userId,
          workspaceId,
          dto.targetIssueId,
          'write',
          true,
        );
        if (id === dto.targetIssueId)
          throw new ConflictException('Issue cannot relate to itself.');
        let source = id,
          target = dto.targetIssueId;
        if (dto.type === 'RELATED' && source > target)
          [source, target] = [target, source];
        if (dto.type !== 'RELATED') {
          const rows = await tx
            .select()
            .from(issueRelations)
            .where(
              and(
                eq(issueRelations.workspaceId, workspaceId),
                eq(issueRelations.type, dto.type),
              ),
            );
          if (createsDependencyCycle(source, target, rows))
            throw new ConflictException('Dependency cycle.');
        }
        const [existing] = await tx
          .select()
          .from(issueRelations)
          .where(
            and(
              eq(issueRelations.sourceIssueId, source),
              eq(issueRelations.targetIssueId, target),
              eq(issueRelations.type, dto.type),
            ),
          );
        if (existing) throw new ConflictException('Relation already exists.');
        const updated = await this.mutation.bump(
          tx,
          issue,
          dto.expectedRevision,
        );
        const [relation] = await tx
          .insert(issueRelations)
          .values({
            id: randomUUID(),
            workspaceId,
            sourceIssueId: source,
            targetIssueId: target,
            type: dto.type,
            createdById: actor,
          })
          .returning();
        await this.mutation.fact(
          tx,
          workspaceId,
          actor,
          id,
          'issue.relation_added',
          {
            issue_id: id,
            relation_id: relation!.id,
            related_issue_id: dto.targetIssueId,
            type: dto.type,
          },
        );
        return { issue: updated, relation };
      },
      false,
      async (tx) => {
        await this.access.require(
          tx,
          identity.userId,
          workspaceId,
          dto.targetIssueId,
          'write',
          true,
        );
      },
    );
  }
  removeRelation(
    identity: Identity,
    workspaceId: string,
    id: string,
    relationId: string,
    expectedRevision: number,
  ) {
    return this.execute(identity, workspaceId, id, async (tx, issue, actor) => {
      const [relation] = await tx
        .select()
        .from(issueRelations)
        .where(
          and(
            eq(issueRelations.workspaceId, workspaceId),
            eq(issueRelations.id, relationId),
            sql`(${issueRelations.sourceIssueId}=${id} OR ${issueRelations.targetIssueId}=${id})`,
          ),
        );
      if (!relation) throw new NotFoundException('Relation not found.');
      await this.access.require(
        tx,
        identity.userId,
        workspaceId,
        relation.sourceIssueId === id
          ? relation.targetIssueId
          : relation.sourceIssueId,
        'write',
        true,
      );
      const updated = await this.mutation.bump(tx, issue, expectedRevision);
      await tx.delete(issueRelations).where(eq(issueRelations.id, relationId));
      await this.mutation.fact(
        tx,
        workspaceId,
        actor,
        id,
        'issue.relation_removed',
        { issue_id: id, relation_id: relationId },
      );
      return updated;
    });
  }
}
