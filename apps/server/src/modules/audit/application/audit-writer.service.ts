import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type { DatabaseTransaction } from '../../../database/transaction';
import { auditLogs } from '../../../database/schema/audit.schema';
import { RequestContextService } from '../../../common/context/request-context.service';
@Injectable()
export class AuditWriter {
  constructor(private readonly requestContext: RequestContextService) {}

  async append(
    tx: DatabaseTransaction,
    input: {
      workspaceId?: string;
      actorId?: string;
      action: string;
      targetType: string;
      targetId: string;
      metadata?: Record<string, unknown>;
      correlationId?: string;
    },
  ): Promise<void> {
    // Accept only low-risk scalar audit context, never entire request payloads.
    const metadata = input.metadata ?? {};
    const inspect = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const child of value) inspect(child);
        return;
      }
      if (value !== null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          if (/password|token|secret|authorization|cookie/i.test(key))
            throw new Error('Sensitive audit metadata is forbidden');
          inspect(child);
        }
      }
    };
    inspect(metadata);
    const requestId = this.requestContext.getRequestId();
    const correlationId =
      input.correlationId ?? (requestId === 'unknown' ? undefined : requestId);
    await tx
      .insert(auditLogs)
      .values({ id: ulid(), ...input, correlationId, metadata });
  }
}
