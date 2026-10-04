import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { labels, issueLabels, projectLabels } from '../../../database/schema';
import { DatabaseService } from '../../../database/database.service';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import { IssueMutationService } from '../../issues/application/issue-mutation.service';
import { CollaborationAccessService } from './collaboration-access.service';
import { CollaborationFactsService } from './collaboration-facts.service';
import { CollaborationRepository } from '../infrastructure/collaboration.repository';
import {
  revision,
  text,
  type Target,
} from '../application/collaboration-policy';
import type {
  CreateLabelDto,
  UpdateLabelDto,
} from '../presentation/collaboration.dto';
@Injectable()
export class LabelService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: CollaborationAccessService,
    private readonly facts: CollaborationFactsService,
    private readonly repo: CollaborationRepository,
    private readonly commands: CommandBus,
    private readonly mutation: IssueMutationService,
  ) {}
  list(userId: string, w: string, limit: number, cursor?: string) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.access.workspace.require(
        tx,
        userId,
        w,
        'workspace.read',
      );
      return this.repo.scoped(
        tx,
        w,
        labels,
        member.id,
        member.role,
        limit,
        cursor,
      );
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
    const [label] = await tx
      .select()
      .from(labels)
      .where(and(eq(labels.workspaceId, w), eq(labels.id, id)))
      .limit(1);
    if (!label || (!allowArchived && label.archivedAt))
      throw new NotFoundException('Label not found.');
    const member = await this.access.scope(
      tx,
      userId,
      w,
      label.teamId,
      write,
      lock,
    );
    return { label, member };
  }
  get(userId: string, w: string, id: string) {
    return this.db.db.transaction(
      async (tx) =>
        (await this.require(tx, userId, w, id, false, false, true)).label,
    );
  }
  create(identity: Identity, w: string, dto: CreateLabelDto) {
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
        await this.unique(tx, w, dto.teamId ?? null, dto.name);
        const [row] = await tx
          .insert(labels)
          .values({
            ...dto,
            id: randomUUID(),
            workspaceId: w,
            name: text(dto.name),
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
        },
      },
    );
  }
  update(identity: Identity, w: string, id: string, dto: UpdateLabelDto) {
    const authorize = async (tx: Tx) => {
      await this.require(tx, identity.userId, w, id, true, true);
      if (dto.teamId !== undefined)
        await this.access.scope(tx, identity.userId, w, dto.teamId, true, true);
    };
    return this.commands.execute(
      identity,
      async (tx) => {
        const { label, member } = await this.require(
          tx,
          identity.userId,
          w,
          id,
          true,
        );
        revision(label.revision, dto.expectedRevision);
        const teamId = dto.teamId === undefined ? label.teamId : dto.teamId;
        if (teamId !== label.teamId) {
          const [a] = await tx
            .select()
            .from(issueLabels)
            .where(eq(issueLabels.labelId, id))
            .limit(1);
          const [b] = await tx
            .select()
            .from(projectLabels)
            .where(eq(projectLabels.labelId, id))
            .limit(1);
          if (a || b)
            throw new ConflictException(
              'Remove label assignments before changing scope.',
            );
        }
        await this.unique(tx, w, teamId, dto.name ?? label.name, id);
        const { expectedRevision: _, ...patch } = dto;
        void _;
        const [row] = await tx
          .update(labels)
          .set({
            ...patch,
            ...(dto.name ? { name: text(dto.name) } : {}),
            revision: label.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(labels.id, id))
          .returning();
        await this.fact(tx, w, member.id, row!, 'updated');
        return row;
      },
      { authorize },
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
        const { label, member } = await this.require(
          tx,
          identity.userId,
          w,
          id,
          true,
          false,
          true,
        );
        revision(label.revision, expected);
        if (restore) await this.unique(tx, w, label.teamId, label.name, id);
        const [row] = await tx
          .update(labels)
          .set({
            archivedAt: restore ? null : new Date(),
            revision: label.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(labels.id, id))
          .returning();
        await this.fact(
          tx,
          w,
          member.id,
          row!,
          restore ? 'restored' : 'archived',
        );
        return row;
      },
      {
        authorize: async (tx) => {
          await this.require(tx, identity.userId, w, id, true, true, true);
        },
      },
    );
  }
  async unique(
    tx: Tx,
    w: string,
    teamId: string | null,
    name: string,
    except?: string,
  ) {
    const rows = await tx
      .select()
      .from(labels)
      .where(
        and(
          eq(labels.workspaceId, w),
          teamId ? eq(labels.teamId, teamId) : isNull(labels.teamId),
          isNull(labels.archivedAt),
        ),
      );
    if (
      rows.some(
        (x) =>
          x.id !== except &&
          x.name.trim().toLowerCase() === text(name).toLowerCase(),
      )
    )
      throw new ConflictException(
        'An active label with this name already exists in the scope.',
      );
  }
  assignments(
    userId: string,
    w: string,
    target: Target,
    limit: number,
    cursor?: string,
  ) {
    return this.db.db.transaction(async (tx) => {
      await this.access.target(tx, userId, w, target);
      return this.repo.assignments(tx, target, limit, cursor);
    });
  }
  link(
    identity: Identity,
    w: string,
    target: Target,
    labelId: string,
    expected?: number,
    remove = false,
  ) {
    const authorize = async (tx: Tx) => {
      await this.access.target(tx, identity.userId, w, target, true, true);
      if (target.targetType === 'project')
        await this.access.projects.require(
          tx,
          identity.userId,
          w,
          target.targetId,
          'manage',
          true,
        );
      await this.require(tx, identity.userId, w, labelId, false, false, remove);
    };
    return this.commands.execute(
      identity,
      async (tx) => {
        const member = await this.access.target(
          tx,
          identity.userId,
          w,
          target,
          true,
        );
        const { label } = await this.require(
          tx,
          identity.userId,
          w,
          labelId,
          false,
          false,
          remove,
        );
        let issueRevision: number | undefined;
        if (target.targetType === 'issue') {
          const { issue } = await this.access.issues.require(
            tx,
            identity.userId,
            w,
            target.targetId,
            'write',
          );
          revision(issue.revision, expected);
          if (label.teamId && label.teamId !== issue.teamId)
            throw new ConflictException(
              'Label scope does not match the issue team.',
            );
          const where = and(
            eq(issueLabels.issueId, issue.id),
            eq(issueLabels.labelId, labelId),
          );
          const [existing] = await tx
            .select()
            .from(issueLabels)
            .where(where)
            .limit(1);
          if (remove && !existing)
            throw new NotFoundException('Label assignment not found.');
          if (!remove && existing)
            throw new ConflictException('Label is already assigned.');
          if (remove) await tx.delete(issueLabels).where(where);
          else
            await tx.insert(issueLabels).values({
              id: randomUUID(),
              workspaceId: w,
              issueId: issue.id,
              labelId,
            });
          issueRevision = (await this.mutation.bump(tx, issue, expected))
            .revision;
        } else {
          if (label.teamId)
            throw new ConflictException(
              'Project labels must be workspace scoped.',
            );
          const where = and(
            eq(projectLabels.projectId, target.targetId),
            eq(projectLabels.labelId, labelId),
          );
          const [existing] = await tx
            .select()
            .from(projectLabels)
            .where(where)
            .limit(1);
          if (remove && !existing)
            throw new NotFoundException('Label assignment not found.');
          if (!remove && existing)
            throw new ConflictException('Label is already assigned.');
          if (remove) await tx.delete(projectLabels).where(where);
          else
            await tx.insert(projectLabels).values({
              id: randomUUID(),
              workspaceId: w,
              projectId: target.targetId,
              labelId,
            });
        }
        await this.facts.append(
          tx,
          w,
          member.id,
          target.targetType,
          target.targetId,
          `${target.targetType}.label_${remove ? 'removed' : 'added'}`,
          { [`${target.targetType}_id`]: target.targetId, label_id: labelId },
          target.targetType === 'issue' ? target.targetId : undefined,
        );
        return {
          targetId: target.targetId,
          labelId,
          removed: remove,
          ...(issueRevision ? { revision: issueRevision } : {}),
        };
      },
      { statusCode: remove ? 200 : 201, authorize },
    );
  }
  private fact(
    tx: Tx,
    w: string,
    actor: string,
    row: typeof labels.$inferSelect,
    event: string,
  ) {
    return this.facts.append(tx, w, actor, 'label', row.id, `label.${event}`, {
      label_id: row.id,
      team_id: row.teamId,
    });
  }
}
