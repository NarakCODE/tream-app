import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, isNotNull, sql } from 'drizzle-orm';
import { documents } from '../../../database/schema';
import { DatabaseService } from '../../../database/database.service';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import { EventWriter } from '../../eventing/application/event-writer.service';
import { AuditWriter } from '../../audit/application/audit-writer.service';
import { DocumentAccessService } from './document-access.service';
import { documentVisibility } from '../infrastructure/document-visibility';
import type {
  CreateDocumentDto,
  UpdateDocumentDto,
  DocumentListDto,
} from '../presentation/document.dto';
@Injectable()
export class DocumentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: DocumentAccessService,
    private readonly commands: CommandBus,
    private readonly events: EventWriter,
    private readonly audit: AuditWriter,
  ) {}
  private async fact(
    tx: Tx,
    w: string,
    actor: string,
    id: string,
    action: string,
  ) {
    const eventType = `document.${action}`;
    const payload = { document_id: id };
    await this.events.append(tx, {
      workspaceId: w,
      actorId: actor,
      aggregateType: 'document',
      aggregateId: id,
      eventType,
      payload,
    });
    await this.audit.append(tx, {
      workspaceId: w,
      actorId: actor,
      targetType: 'document',
      targetId: id,
      action: eventType,
      metadata: payload,
    });
  }
  list(userId: string, w: string, q: DocumentListDto) {
    return this.db.db.transaction(async (tx) => {
      const { member } = await this.access.workspace.require(
        tx,
        userId,
        w,
        'workspace.read',
      );
      if (!!q.ownerType !== !!q.ownerId)
        throw new BadRequestException('Supply both ownerType and ownerId.');
      if (q.ownerType && q.ownerId)
        await this.access.owner(tx, userId, w, {
          ownerType: q.ownerType,
          ownerId: q.ownerId,
        });
      const field =
        q.ownerType === 'project'
          ? documents.projectId
          : q.ownerType === 'team'
            ? documents.teamId
            : documents.initiativeId;
      const scope = and(
        eq(documents.workspaceId, w),
        documentVisibility(member.id, member.role),
        q.lifecycle === 'deleted'
          ? isNotNull(documents.deletedAt)
          : isNull(documents.deletedAt),
        q.lifecycle === 'archived'
          ? isNotNull(documents.archivedAt)
          : q.lifecycle === 'active'
            ? isNull(documents.archivedAt)
            : undefined,
        q.ownerId ? eq(field, q.ownerId) : undefined,
      );
      const [count] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(documents)
        .where(scope);
      const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
      const rows = await tx
        .select()
        .from(documents)
        .where(
          and(
            scope,
            cursor
              ? sql`(date_trunc('milliseconds',${documents.createdAt}),${documents.id}) < (${cursor.createdAt.toISOString()}::timestamptz,${cursor.id})`
              : undefined,
          ),
        )
        .orderBy(
          desc(sql`date_trunc('milliseconds',${documents.createdAt})`),
          desc(documents.id),
        )
        .limit(q.limit + 1);
      const items = rows.slice(0, q.limit);
      return {
        paginationType: 'cursor',
        items,
        total: count!.total,
        limit: q.limit,
        cursor: q.cursor ?? null,
        hasNext: rows.length > q.limit,
        nextCursor:
          rows.length > q.limit ? encodeCursor(items[items.length - 1]!) : null,
      };
    });
  }
  get(userId: string, w: string, id: string) {
    return this.db.db.transaction(
      async (tx) => (await this.access.require(tx, userId, w, id)).document,
    );
  }
  create(identity: Identity, w: string, dto: CreateDocumentDto) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const member = await this.access.owner(
          tx,
          identity.userId,
          w,
          dto,
          true,
        );
        const [row] = await tx
          .insert(documents)
          .values({
            id: randomUUID(),
            workspaceId: w,
            authorId: member.id,
            title: dto.title.trim(),
            body: dto.body,
            projectId: dto.ownerType === 'project' ? dto.ownerId : null,
            teamId: dto.ownerType === 'team' ? dto.ownerId : null,
            initiativeId: dto.ownerType === 'initiative' ? dto.ownerId : null,
          })
          .returning();
        await this.fact(tx, w, member.id, row!.id, 'created');
        return row!;
      },
      {
        statusCode: 201,
        authorize: async (tx) => {
          await this.access.owner(tx, identity.userId, w, dto, true, true);
        },
      },
    );
  }
  private run<T>(
    identity: Identity,
    w: string,
    id: string,
    handler: (
      tx: Tx,
      row: typeof documents.$inferSelect,
      actor: string,
    ) => Promise<T>,
    allowInactive = false,
  ) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { document, member } = await this.access.require(
          tx,
          identity.userId,
          w,
          id,
          'write',
          false,
          allowInactive,
        );
        return handler(tx, document, member.id);
      },
      {
        authorize: async (tx) => {
          await this.access.require(
            tx,
            identity.userId,
            w,
            id,
            'write',
            true,
            allowInactive,
          );
        },
      },
    );
  }
  private async bump(
    tx: Tx,
    row: typeof documents.$inferSelect,
    expected: number,
    patch: Partial<typeof documents.$inferInsert>,
  ) {
    if (row.revision !== expected)
      throw new ConflictException(
        'Revision conflict. Fetch the current resource and retry.',
      );
    return (
      await tx
        .update(documents)
        .set({ ...patch, revision: row.revision + 1, updatedAt: new Date() })
        .where(eq(documents.id, row.id))
        .returning()
    )[0]!;
  }
  update(identity: Identity, w: string, id: string, dto: UpdateDocumentDto) {
    return this.run(identity, w, id, async (tx, row, actor) => {
      const { expectedRevision, ...patch } = dto;
      const updated = await this.bump(tx, row, expectedRevision, {
        ...patch,
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
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
      async (tx, row, actor) => {
        if (action === 'archived' && row.deletedAt)
          throw new ConflictException(
            'Restore a deleted document before archiving it.',
          );
        const updated = await this.bump(
          tx,
          row,
          expected,
          action === 'restored'
            ? { archivedAt: null, deletedAt: null }
            : action === 'archived'
              ? { archivedAt: new Date(), deletedAt: null }
              : { deletedAt: new Date(), archivedAt: null },
        );
        await this.fact(tx, w, actor, id, action);
        return updated;
      },
      true,
    );
  }
}
