import { Injectable } from '@nestjs/common';
import { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { EventWriter } from '../../eventing/application/event-writer.service';
import { AuditWriter } from '../../audit/application/audit-writer.service';
import { ProjectAccessService } from './project-access.service';
@Injectable()
export class ProjectCommandService {
  constructor(
    private readonly commands: CommandBus,
    private readonly access: ProjectAccessService,
    private readonly events: EventWriter,
    private readonly audit: AuditWriter,
  ) {}
  execute<T>(
    identity: Identity,
    workspaceId: string,
    projectId: string,
    handler: (tx: Tx, actorId: string) => Promise<T>,
    statusCode = 200,
    allowInactive = false,
    additionalTeamIds: string[] = [],
  ) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { member } = await this.access.require(
          tx,
          identity.userId,
          workspaceId,
          projectId,
          'manage',
          false,
          allowInactive,
          additionalTeamIds,
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
            projectId,
            'manage',
            true,
            allowInactive,
            additionalTeamIds,
          );
        },
      },
    );
  }
  async fact(
    tx: Tx,
    workspaceId: string,
    actorId: string,
    projectId: string,
    eventType: string,
    payload: Record<string, unknown>,
    aggregateType = 'project',
  ) {
    await this.events.append(tx, {
      workspaceId,
      actorId,
      aggregateType,
      aggregateId: projectId,
      eventType,
      payload,
    });
    await this.audit.append(tx, {
      workspaceId,
      actorId,
      action: eventType,
      targetType: aggregateType,
      targetId: projectId,
      metadata: payload,
    });
  }
}
