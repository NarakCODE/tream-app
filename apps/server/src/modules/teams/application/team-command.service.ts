import { Injectable } from '@nestjs/common';
import { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput } from '../../../common/idempotency/idempotency.types';
import type { DatabaseTransaction } from '../../../database/transaction';
import { TeamAccessService } from './team-access.service';
import { EventWriter } from '../../eventing/application/event-writer.service';
import { AuditWriter } from '../../audit/application/audit-writer.service';
@Injectable()
export class TeamCommandService {
  constructor(
    private readonly commands: CommandBus,
    private readonly access: TeamAccessService,
    private readonly events: EventWriter,
    private readonly audit: AuditWriter,
  ) {}
  execute<T>(
    identity: IdempotencyReservationInput,
    workspaceId: string,
    teamId: string,
    handler: (tx: DatabaseTransaction, actorId: string) => Promise<T>,
    statusCode = 200,
    allowRetired = false,
  ) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { member } = await this.access.require(
          tx,
          identity.userId,
          workspaceId,
          teamId,
          'manage',
          false,
          allowRetired,
        );
        return handler(tx, member.id);
      },
      {
        statusCode,
        authorize: async (tx) => {
          await this.access.require(
            tx,
            identity.userId,
            workspaceId,
            teamId,
            'manage',
            true,
            allowRetired,
          );
        },
      },
    );
  }
  async fact(
    tx: DatabaseTransaction,
    workspaceId: string,
    actorId: string,
    teamId: string,
    eventType: string,
    payload: Record<string, unknown>,
    aggregateType = 'team',
    aggregateId = teamId,
  ) {
    await this.events.append(tx, {
      workspaceId,
      actorId,
      aggregateType,
      aggregateId,
      eventType,
      payload,
    });
    await this.audit.append(tx, {
      workspaceId,
      actorId,
      action: eventType,
      targetType: aggregateType,
      targetId: aggregateId,
      metadata: payload,
    });
  }
}
