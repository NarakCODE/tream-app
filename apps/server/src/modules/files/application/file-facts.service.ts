import { Injectable } from '@nestjs/common';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { EventWriter } from '../../eventing/application/event-writer.service';
import { AuditWriter } from '../../audit/application/audit-writer.service';
import type { AttachmentRecord } from '../infrastructure/file.repository';
import { FileRepository } from '../infrastructure/file.repository';
@Injectable()
export class FileFactsService {
  constructor(
    private readonly events: EventWriter,
    private readonly audit: AuditWriter,
    private readonly repository: FileRepository,
  ) {}
  async file(
    tx: Tx,
    w: string,
    actorId: string | undefined,
    id: string,
    action: string,
    reason?: string,
  ) {
    const payload: Record<string, unknown> = {
      file_id: id,
      ...(reason ? { reason } : {}),
    };
    await this.events.append(tx, {
      workspaceId: w,
      ...(actorId ? { actorId } : {}),
      aggregateType: 'file',
      aggregateId: id,
      eventType: `file.${action}`,
      payload,
    });
    await this.audit.append(tx, {
      workspaceId: w,
      ...(actorId ? { actorId } : {}),
      targetType: 'file',
      targetId: id,
      action: `file.${action}`,
      metadata: payload,
    });
  }
  async attachment(
    tx: Tx,
    w: string,
    actorId: string,
    row: AttachmentRecord,
    action: 'created' | 'detached' | 'restored',
  ) {
    const target = this.repository.target(row);
    const payload = {
      attachment_id: row.id,
      file_id: row.fileId,
      target_type: target.targetType,
      target_id: target.targetId,
    };
    await this.events.append(tx, {
      workspaceId: w,
      ...(actorId ? { actorId } : {}),
      aggregateType: 'attachment',
      aggregateId: row.id,
      eventType: `attachment.${action}`,
      ...(target.targetType === 'document' ? { schemaVersion: 2 } : {}),
      payload,
    });
    await this.audit.append(tx, {
      workspaceId: w,
      ...(actorId ? { actorId } : {}),
      targetType: 'attachment',
      targetId: row.id,
      action: `attachment.${action}`,
      metadata: payload,
    });
  }
}
