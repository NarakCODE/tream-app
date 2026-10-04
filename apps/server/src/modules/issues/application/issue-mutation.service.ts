import { Injectable } from '@nestjs/common';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { ResourceConflictException } from '../../../common/exceptions/resource-conflict.exception';
import {
  IssueRepository,
  type Issue,
} from '../infrastructure/issue.repository';
import { EventWriter } from '../../eventing/application/event-writer.service';
import { AuditWriter } from '../../audit/application/audit-writer.service';
@Injectable()
export class IssueMutationService {
  constructor(
    private readonly repository: IssueRepository,
    private readonly events: EventWriter,
    private readonly audit: AuditWriter,
  ) {}
  async bump(
    tx: Tx,
    issue: Issue,
    expectedRevision?: number,
    patch: Parameters<IssueRepository['patch']>[2] = {},
  ) {
    if (expectedRevision !== undefined && issue.revision !== expectedRevision)
      throw new ResourceConflictException('Issue revision does not match.', {
        expectedRevision,
        currentRevision: issue.revision,
      });
    return this.repository.patch(tx, issue.id, {
      ...patch,
      revision: issue.revision + 1,
    });
  }
  async fact(
    tx: Tx,
    workspaceId: string,
    actorId: string | undefined,
    issueId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    await this.events.append(tx, {
      workspaceId,
      ...(actorId ? { actorId } : {}),
      aggregateType: 'issue',
      aggregateId: issueId,
      eventType,
      ...(eventType === 'issue.updated' ? { schemaVersion: 2 } : {}),
      payload,
    });
    await this.audit.append(tx, {
      workspaceId,
      ...(actorId ? { actorId } : {}),
      action: eventType,
      targetType: 'issue',
      targetId: issueId,
      metadata: payload,
    });
  }
}
