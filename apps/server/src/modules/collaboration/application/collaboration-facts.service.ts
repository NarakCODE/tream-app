import { Injectable } from '@nestjs/common';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { EventWriter } from '../../eventing/application/event-writer.service';
import { AuditWriter } from '../../audit/application/audit-writer.service';
import { issueActivity } from '../../../database/schema';
import { randomUUID } from 'node:crypto';
@Injectable()
export class CollaborationFactsService {
  constructor(
    private readonly events: EventWriter,
    private readonly audit: AuditWriter,
  ) {}
  async append(
    tx: Tx,
    workspaceId: string,
    actorId: string,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>,
    issueId?: string,
    schemaVersion = 1,
  ) {
    const event = await this.events.append(tx, {
      workspaceId,
      actorId,
      aggregateType,
      aggregateId,
      eventType,
      payload,
      schemaVersion,
    });
    await this.audit.append(tx, {
      workspaceId,
      actorId,
      targetType: aggregateType,
      targetId: aggregateId,
      action: eventType,
      metadata: payload,
    });
    if (issueId)
      await tx.insert(issueActivity).values({
        id: randomUUID(),
        workspaceId,
        issueId,
        actorId,
        eventId: event.id,
        action: eventType,
        changes: payload,
      });
  }
}
