import { sourceVisibility } from './file-visibility';
import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql, desc } from 'drizzle-orm';
import { attachments, files } from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import { publicFile, type FileTarget } from '../domain/file-policy';
export type FileRecord = typeof files.$inferSelect;
export type AttachmentRecord = typeof attachments.$inferSelect;
@Injectable()
export class FileRepository {
  async file(tx: Tx, w: string, id: string, lock = false) {
    const query = tx
      .select()
      .from(files)
      .where(and(eq(files.workspaceId, w), eq(files.id, id)))
      .limit(1);
    return (lock ? await query.for('update') : await query)[0];
  }
  async attachment(tx: Tx, w: string, id: string) {
    return (
      await tx
        .select()
        .from(attachments)
        .where(and(eq(attachments.workspaceId, w), eq(attachments.id, id)))
        .limit(1)
    )[0];
  }
  async links(tx: Tx, id: string, includeDeleted = false) {
    return tx
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.fileId, id),
          includeDeleted ? undefined : isNull(attachments.deletedAt),
        ),
      )
      .orderBy(attachments.id);
  }
  async reservedBytes(tx: Tx, w: string) {
    const [row] = await tx
      .select({
        total: sql<number>`COALESCE(sum(${files.sizeBytes}),0)::bigint`,
      })
      .from(files)
      .where(and(eq(files.workspaceId, w), sql`${files.status} <> 'PURGED'`));
    return Number(row!.total);
  }
  async list(
    tx: Tx,
    w: string,
    target: FileTarget,
    memberId: string,
    role: string,
    limit: number,
    cursor?: string,
  ) {
    const field =
      target.targetType === 'issue'
        ? attachments.issueId
        : target.targetType === 'project'
          ? attachments.projectId
          : target.targetType === 'comment'
            ? attachments.commentId
            : attachments.documentId;
    const base = and(
      sourceVisibility(memberId, role),
      eq(attachments.workspaceId, w),
      eq(field, target.targetId),
      isNull(attachments.deletedAt),
      sql`${files.status} IN ('READY','DELETED','PURGING','PURGED')`,
    );
    const seek = cursor ? decodeCursor(cursor) : undefined;
    const rows = await tx
      .select({ attachment: attachments, file: files })
      .from(attachments)
      .innerJoin(files, eq(files.id, attachments.fileId))
      .where(
        and(
          base,
          seek
            ? sql`(date_trunc('milliseconds',${attachments.createdAt}),${attachments.id}) < (${seek.createdAt.toISOString()}::timestamptz,${seek.id})`
            : undefined,
        ),
      )
      .orderBy(
        desc(sql`date_trunc('milliseconds',${attachments.createdAt})`),
        desc(attachments.id),
      )
      .limit(limit + 1);
    const [count] = await tx
      .select({ total: sql<number>`count(*)::integer` })
      .from(attachments)
      .innerJoin(files, eq(files.id, attachments.fileId))
      .where(base);
    const items = rows
      .slice(0, limit)
      .map((row) => ({ ...row.attachment, file: publicFile(row.file) }));
    return {
      paginationType: 'cursor',
      items,
      total: count!.total,
      cursor: cursor ?? null,
      limit,
      hasNext: rows.length > limit,
      nextCursor:
        rows.length > limit ? encodeCursor(items[items.length - 1]!) : null,
    };
  }
  target(link: AttachmentRecord): FileTarget {
    return link.issueId
      ? { targetType: 'issue', targetId: link.issueId }
      : link.projectId
        ? { targetType: 'project', targetId: link.projectId }
        : link.commentId
          ? { targetType: 'comment', targetId: link.commentId }
          : { targetType: 'document', targetId: link.documentId! };
  }
}
