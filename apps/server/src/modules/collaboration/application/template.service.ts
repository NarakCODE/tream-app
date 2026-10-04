import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TemplateDefaultsDto } from '../presentation/collaboration.dto';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  issueTemplates,
  issueStatuses,
  cycles,
  projectMilestones,
  memberships,
  labels,
  issueLabels,
} from '../../../database/schema';
import { DatabaseService } from '../../../database/database.service';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import { IssueService } from '../../issues/application/issue.service';
import { CollaborationAccessService } from './collaboration-access.service';
import { CollaborationFactsService } from './collaboration-facts.service';
import { CollaborationRepository } from '../infrastructure/collaboration.repository';
import { revision, text } from '../application/collaboration-policy';
import type {
  CreateTemplateDto,
  UpdateTemplateDto,
  InstantiateTemplateDto,
} from '../presentation/collaboration.dto';
@Injectable()
export class TemplateService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: CollaborationAccessService,
    private readonly facts: CollaborationFactsService,
    private readonly repo: CollaborationRepository,
    private readonly commands: CommandBus,
    private readonly issues: IssueService,
  ) {}
  list(userId: string, w: string, limit: number, cursor?: string) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.access.workspace.require(
        tx,
        userId,
        w,
        'workspace.read',
      );
      const page = await this.repo.scoped(
        tx,
        w,
        issueTemplates,
        member.id,
        member.role,
        limit,
        cursor,
      );
      return {
        ...page,
        items: page.items.map((item) => {
          const { defaults: _, ...rest } =
            item as typeof issueTemplates.$inferSelect;
          void _;
          return rest;
        }),
      };
    });
  }
  async require(
    tx: Tx,
    userId: string,
    w: string,
    id: string,
    write = false,
    lock = false,
    allowArchived = false,
  ) {
    const [row] = await tx
      .select()
      .from(issueTemplates)
      .where(and(eq(issueTemplates.workspaceId, w), eq(issueTemplates.id, id)))
      .limit(1);
    if (!row || (!allowArchived && row.archivedAt))
      throw new NotFoundException('Issue template not found.');
    const member = await this.access.scope(
      tx,
      userId,
      w,
      row.teamId,
      write,
      lock,
    );
    return { row, member };
  }
  get(userId: string, w: string, id: string) {
    return this.db.db.transaction(async (tx) => {
      const { row } = await this.require(tx, userId, w, id);
      await this.validate(tx, userId, w, row.teamId, row.defaults);
      return row;
    });
  }
  create(identity: Identity, w: string, dto: CreateTemplateDto) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const member = await this.access.scope(
          tx,
          identity.userId,
          w,
          dto.teamId,
          true,
        );
        await this.validate(
          tx,
          identity.userId,
          w,
          dto.teamId ?? null,
          dto.defaults ?? {},
        );
        const [row] = await tx
          .insert(issueTemplates)
          .values({
            ...dto,
            id: randomUUID(),
            workspaceId: w,
            name: text(dto.name),
            defaults: { ...dto.defaults },
            createdById: member.id,
          })
          .returning();
        await this.fact(tx, w, member.id, row!, 'created');
        return row;
      },
      {
        statusCode: 201,
        authorize: async (tx) => {
          await this.access.scope(
            tx,
            identity.userId,
            w,
            dto.teamId,
            true,
            true,
          );
          await this.validate(
            tx,
            identity.userId,
            w,
            dto.teamId ?? null,
            dto.defaults ?? {},
          );
        },
      },
    );
  }
  update(identity: Identity, w: string, id: string, dto: UpdateTemplateDto) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { row, member } = await this.require(
          tx,
          identity.userId,
          w,
          id,
          true,
        );
        revision(row.revision, dto.expectedRevision);
        const teamId = dto.teamId === undefined ? row.teamId : dto.teamId;
        await this.access.scope(tx, identity.userId, w, teamId, true);
        await this.validate(
          tx,
          identity.userId,
          w,
          teamId,
          dto.defaults ?? row.defaults,
        );
        const { expectedRevision: _, defaults, ...patch } = dto;
        void _;
        const [updated] = await tx
          .update(issueTemplates)
          .set({
            ...patch,
            ...(dto.name ? { name: text(dto.name) } : {}),
            ...(defaults ? { defaults: { ...defaults } } : {}),
            revision: row.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(issueTemplates.id, id))
          .returning();
        await this.fact(tx, w, member.id, updated!, 'updated');
        return updated;
      },
      {
        authorize: async (tx) => {
          const { row } = await this.require(
            tx,
            identity.userId,
            w,
            id,
            true,
            true,
          );
          const teamId = dto.teamId === undefined ? row.teamId : dto.teamId;
          await this.access.scope(tx, identity.userId, w, teamId, true, true);
          await this.validate(
            tx,
            identity.userId,
            w,
            teamId,
            dto.defaults ?? row.defaults,
          );
        },
      },
    );
  }
  lifecycle(
    identity: Identity,
    w: string,
    id: string,
    expected: number,
    restore = false,
  ) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { row, member } = await this.require(
          tx,
          identity.userId,
          w,
          id,
          true,
          false,
          true,
        );
        revision(row.revision, expected);
        if (restore)
          await this.validate(tx, identity.userId, w, row.teamId, row.defaults);
        const [updated] = await tx
          .update(issueTemplates)
          .set({
            archivedAt: restore ? null : new Date(),
            revision: row.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(issueTemplates.id, id))
          .returning();
        await this.fact(
          tx,
          w,
          member.id,
          updated!,
          restore ? 'restored' : 'archived',
        );
        return updated;
      },
      {
        authorize: async (tx) => {
          const { row } = await this.require(
            tx,
            identity.userId,
            w,
            id,
            true,
            true,
            true,
          );
          if (restore)
            await this.validate(
              tx,
              identity.userId,
              w,
              row.teamId,
              row.defaults,
            );
        },
      },
    );
  }
  async validate(
    tx: Tx,
    userId: string,
    w: string,
    scope: string | null,
    defaults: Record<string, unknown> | TemplateDefaultsDto,
  ) {
    if (
      Object.values(defaults).some((x) => x === null) ||
      validateSync(plainToInstance(TemplateDefaultsDto, defaults), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }).length
    )
      throw new BadRequestException('Invalid issue template defaults.');
    const allowed = [
      'teamId',
      'statusId',
      'projectId',
      'milestoneId',
      'cycleId',
      'assigneeId',
      'priority',
      'estimate',
      'labelIds',
    ];
    if (Object.keys(defaults).some((k) => !allowed.includes(k)))
      throw new BadRequestException('Unsupported issue template defaults.');
    const d = defaults as TemplateDefaultsDto;
    const teamId = d.teamId ?? scope;
    if (scope && d.teamId && scope !== d.teamId)
      throw new ConflictException(
        'Template defaults must match its team scope.',
      );
    if (!scope && (d.teamId || d.statusId || d.cycleId))
      throw new BadRequestException(
        'Team defaults require a team-scoped template.',
      );
    if (teamId) await this.access.teams.require(tx, userId, w, teamId, 'read');
    if (d.statusId) {
      const [s] = await tx
        .select()
        .from(issueStatuses)
        .where(
          and(
            eq(issueStatuses.id, d.statusId),
            eq(issueStatuses.teamId, teamId!),
            isNull(issueStatuses.retiredAt),
          ),
        )
        .limit(1);
      if (!s) throw new NotFoundException('Usable template status not found.');
    }
    if (d.cycleId) {
      const [c] = await tx
        .select()
        .from(cycles)
        .where(
          and(
            eq(cycles.id, d.cycleId),
            eq(cycles.workspaceId, w),
            eq(cycles.teamId, teamId!),
            isNull(cycles.completedAt),
            isNull(cycles.canceledAt),
          ),
        )
        .limit(1);
      if (!c) throw new NotFoundException('Usable template cycle not found.');
    }
    if (d.projectId) {
      const { project, links } = await this.access.projects.require(
        tx,
        userId,
        w,
        d.projectId,
      );
      if (project.archivedAt || project.deletedAt)
        throw new ConflictException('Template project is inactive.');
      if (teamId && !links.some((x) => x.teamId === teamId))
        throw new ConflictException('Template project must include the team.');
      if (!scope && links.length)
        throw new BadRequestException(
          'Linked project defaults require a team-scoped template.',
        );
    }
    if (d.milestoneId) {
      if (!d.projectId)
        throw new BadRequestException('Milestone default requires a project.');
      const [m] = await tx
        .select()
        .from(projectMilestones)
        .where(
          and(
            eq(projectMilestones.id, d.milestoneId),
            eq(projectMilestones.projectId, d.projectId),
            eq(projectMilestones.workspaceId, w),
          ),
        )
        .limit(1);
      if (!m) throw new NotFoundException('Template milestone not found.');
    }
    if (d.assigneeId) {
      const [m] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.id, d.assigneeId),
            eq(memberships.workspaceId, w),
            eq(memberships.state, 'ACTIVE'),
          ),
        )
        .limit(1);
      if (!m || m.role === 'GUEST')
        throw new NotFoundException('Usable template assignee not found.');
      if (teamId)
        await this.access.teams.require(tx, m.userId, w, teamId, 'read');
    }
    for (const id of d.labelIds ?? []) {
      const [l] = await tx
        .select()
        .from(labels)
        .where(
          and(
            eq(labels.id, id),
            eq(labels.workspaceId, w),
            isNull(labels.archivedAt),
          ),
        )
        .limit(1);
      if (!l || (l.teamId && l.teamId !== teamId))
        throw new NotFoundException('Usable template label not found.');
    }
  }
  instantiate(
    identity: Identity,
    w: string,
    id: string,
    dto: InstantiateTemplateDto,
  ) {
    const authorize = async (tx: Tx) => {
      const { row } = await this.require(
        tx,
        identity.userId,
        w,
        id,
        false,
        true,
      );
      if (row.teamId && row.teamId !== dto.teamId)
        throw new ConflictException('Template is scoped to another team.');
      await this.access.teams.require(
        tx,
        identity.userId,
        w,
        dto.teamId,
        'write',
        true,
      );
      await this.validate(tx, identity.userId, w, row.teamId, row.defaults);
    };
    return this.commands.execute(
      identity,
      async (tx) => {
        const { row } = await this.require(tx, identity.userId, w, id);
        const defaults = row.defaults as TemplateDefaultsDto;
        const { labelIds, ...fields } = defaults;
        const issue = await this.issues.createInTransaction(
          tx,
          identity.userId,
          w,
          {
            ...fields,
            teamId: dto.teamId,
            title: text(dto.title ?? row.titleTemplate ?? row.name),
            description: row.bodyTemplate,
          },
        );
        const { member } = await this.access.workspace.require(
          tx,
          identity.userId,
          w,
          'workspace.read',
        );
        for (const labelId of labelIds ?? []) {
          await tx.insert(issueLabels).values({
            id: randomUUID(),
            workspaceId: w,
            issueId: issue.id,
            labelId,
          });
          await this.facts.append(
            tx,
            w,
            member.id,
            'issue',
            issue.id,
            'issue.label_added',
            { issue_id: issue.id, label_id: labelId },
            issue.id,
          );
        }
        return issue;
      },
      { statusCode: 201, authorize },
    );
  }
  private fact(
    tx: Tx,
    w: string,
    actor: string,
    row: typeof issueTemplates.$inferSelect,
    event: string,
  ) {
    return this.facts.append(
      tx,
      w,
      actor,
      'issue_template',
      row.id,
      `issue_template.${event}`,
      { template_id: row.id, team_id: row.teamId },
    );
  }
}
