import { Injectable } from '@nestjs/common';
import { and, eq, lt, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import type { DatabaseTransaction } from '../../database/transaction';
import { idempotencyKeys } from '../../database/schema/idempotency.schema';
import { ResourceConflictException } from '../exceptions/resource-conflict.exception';
import type { IdempotencyReservationInput } from './idempotency.types';

@Injectable()
export class CommandBus {
  constructor(private readonly database: DatabaseService) {}

  execute<T>(
    input: IdempotencyReservationInput,
    handler: (tx: DatabaseTransaction) => Promise<T>,
    options: {
      statusCode?: number;
      authorize?: (tx: DatabaseTransaction) => Promise<void>;
    } = {},
  ): Promise<T> {
    return this.database.db
      .transaction(async (tx) => {
        // Serializes matching identities, including concurrent first use. The
        // transaction lock and response row disappear together on rollback.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.userId, input.method, input.route, input.key])}, 0))`,
        );
        if (options.authorize) await options.authorize(tx);
        const identity = and(
          eq(idempotencyKeys.userId, input.userId),
          eq(idempotencyKeys.method, input.method),
          eq(idempotencyKeys.route, input.route),
          eq(idempotencyKeys.key, input.key),
        );
        await tx
          .delete(idempotencyKeys)
          .where(and(identity, lt(idempotencyKeys.expiresAt, new Date())));
        const [existing] = await tx
          .select()
          .from(idempotencyKeys)
          .where(identity)
          .limit(1);
        if (existing) {
          if (existing.requestHash !== input.requestHash)
            throw new ResourceConflictException(
              'The Idempotency-Key was used with a different payload.',
            );
          if (existing.status !== 'COMPLETED')
            throw new ResourceConflictException(
              'The command is already in progress.',
            );
          return existing.responseBody as T;
        }
        const body = await handler(tx);
        // JSON serialization fails before commit for non-replayable responses.
        const persisted = JSON.parse(JSON.stringify(body ?? null)) as T;
        await tx.insert(idempotencyKeys).values({
          ...input,
          status: 'COMPLETED',
          responseStatus: options.statusCode ?? 200,
          responseBody: persisted,
          responseHeaders: {},
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
        });
        return persisted;
      })
      .catch((error: unknown) => {
        // Deferred team invariants can fail at COMMIT, including workspace
        // membership changes. Return a domain conflict without leaking SQL or
        // private-team names. Other database errors retain their existing behavior.
        let cause: unknown = error;
        for (let depth = 0; depth < 8; depth++) {
          if (typeof cause !== 'object' || cause === null) break;
          const record = cause as Record<string, unknown>;
          const constraint = record.constraint;
          if (
            typeof constraint === 'string' &&
            ((record.code === '23514' &&
              ['m05_', 'm06_', 'm07_', 'm08_', 'm09_', 'm10_'].some((prefix) =>
                constraint.startsWith(prefix),
              )) ||
              (record.code === '23P01' && constraint === 'm08_cycle_window') ||
              (record.code === '23505' &&
                [
                  'teams_workspace_key_permanent_idx',
                  'team_memberships_team_membership_idx',
                  'issue_statuses_team_name_active_idx',
                  'issue_statuses_team_position_idx',
                  'issue_statuses_team_default_active_idx',
                  'project_statuses_name_active_idx',
                  'project_statuses_position_active_idx',
                  'project_statuses_default_active_idx',
                  'project_members_project_membership_idx',
                  'project_milestones_position_idx',
                  'project_teams_project_team_idx',
                  'project_teams_tenant_association_idx',
                  'issue_identifiers_permanent_idx',
                  'issue_identifiers_current_idx',
                  'issue_relations_pair_idx',
                  'cycle_rollovers_once_idx',
                  'comment_reactions_unique_idx',
                  'issue_labels_unique_idx',
                  'project_labels_unique_idx',
                  'issue_subscribers_unique_idx',
                  'project_subscribers_unique_idx',
                  'labels_workspace_name_active_idx',
                  'labels_team_name_active_idx',
                  'cycles_team_number_idx',
                  'issue_activity_event_idx',
                  'files_storage_key_permanent_idx',
                  'attachments_issue_active_idx',
                  'attachments_project_active_idx',
                  'attachments_comment_active_idx',
                  'storage_cleanup_active_file_idx',
                ].includes(constraint)))
          ) {
            throw new ResourceConflictException(
              'The change conflicts with resource identity, administration or workflow requirements.',
            );
          }
          cause = record.cause;
        }
        throw error;
      });
  }
}
