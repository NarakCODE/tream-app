import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { issueSubscribers, projectSubscribers } from '../../../database/schema';
import { DatabaseService } from '../../../database/database.service';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import { CollaborationAccessService } from './collaboration-access.service';
import { CollaborationFactsService } from './collaboration-facts.service';
import { CollaborationRepository } from '../infrastructure/collaboration.repository';
import type { Target } from '../application/collaboration-policy';
@Injectable()
export class SubscriberService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: CollaborationAccessService,
    private readonly facts: CollaborationFactsService,
    private readonly repo: CollaborationRepository,
    private readonly commands: CommandBus,
  ) {}
  list(
    userId: string,
    w: string,
    target: Target,
    limit: number,
    cursor?: string,
  ) {
    return this.db.db.transaction(async (tx) => {
      await this.access.target(tx, userId, w, target);
      return this.repo.subscribers(tx, target, limit, cursor);
    });
  }
  change(identity: Identity, w: string, target: Target, remove = false) {
    const authorize = async (tx: Tx) => {
      await this.access.target(tx, identity.userId, w, target, true, true);
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
        const table =
          target.targetType === 'issue' ? issueSubscribers : projectSubscribers;
        const field =
          target.targetType === 'issue'
            ? issueSubscribers.issueId
            : projectSubscribers.projectId;
        const condition = and(
          eq(field, target.targetId),
          eq(table.membershipId, member.id),
        );
        const [row] = await tx.select().from(table).where(condition).limit(1);
        if (remove && !row)
          throw new NotFoundException('Subscription not found.');
        if (!remove && row) throw new ConflictException('Already subscribed.');
        if (remove) await tx.delete(table).where(condition);
        else if (target.targetType === 'issue')
          await tx.insert(issueSubscribers).values({
            id: randomUUID(),
            workspaceId: w,
            issueId: target.targetId,
            membershipId: member.id,
          });
        else
          await tx.insert(projectSubscribers).values({
            id: randomUUID(),
            workspaceId: w,
            projectId: target.targetId,
            membershipId: member.id,
          });
        await this.facts.append(
          tx,
          w,
          member.id,
          target.targetType,
          target.targetId,
          `${target.targetType}.${remove ? 'unsubscribed' : 'subscribed'}`,
          {
            [`${target.targetType}_id`]: target.targetId,
            membership_id: member.id,
          },
          target.targetType === 'issue' ? target.targetId : undefined,
        );
        return { membershipId: member.id, subscribed: !remove };
      },
      { statusCode: remove ? 200 : 201, authorize },
    );
  }
  activity(
    userId: string,
    w: string,
    issueId: string,
    limit: number,
    cursor?: string,
  ) {
    return this.db.db.transaction(async (tx) => {
      await this.access.issues.require(tx, userId, w, issueId);
      return this.repo.activity(tx, w, issueId, limit, cursor);
    });
  }
}
