import { auditLogs } from '../schema/audit.schema';
import {
  eventAggregateHeads,
  eventConsumerReceipts,
  eventDispatchAttempts,
  events,
} from '../schema/event.schema';
import { EventContractRegistry } from '../../modules/eventing/infrastructure/event-contract-registry';
import type { DemoContext } from './context';

/** Historical demo facts are already consumed; seeding never schedules work. */
export async function seedHistory(ctx: DemoContext): Promise<void> {
  const contracts = new EventContractRegistry();
  // Collaboration activity also records facts for these issues. Reserve their
  // heads so subsequent real commands advance instead of reusing revision one.
  await ctx.tx
    .insert(eventAggregateHeads)
    .values(
      Array.from({ length: 32 }, (_, i) => ({
        workspaceId: ctx.workspaceId,
        aggregateType: 'issue',
        aggregateId: ctx.issue(i),
        revision: 1,
      })),
    )
    .onConflictDoNothing();
  for (let i = 0; i < 24; i++) {
    const group = i % 4;
    const issueId = ctx.issue(i);
    const projectId = ctx.project(i % 12);
    const initiativeId = ctx.id(`initiative:${i % 8}`);
    const eventType = [
      'issue.assigned',
      'comment.created',
      'project.updated',
      'initiative.updated',
    ][group]!;
    const aggregateType =
      group === 0
        ? 'issue'
        : group === 1
          ? 'comment'
          : group === 2
            ? 'project'
            : 'initiative';
    const aggregateId =
      group === 0
        ? issueId
        : group === 1
          ? ctx.id(`comment:${i}`)
          : group === 2
            ? projectId
            : initiativeId;
    const payload: Record<string, unknown> =
      group === 0
        ? {
            issue_id: issueId,
            previous_assignee_membership_id: null,
            assignee_membership_id: ctx.member(0),
          }
        : group === 1
          ? {
              comment_id: ctx.id(`comment:${i}`),
              target_type: 'issue',
              target_id: ctx.issue(i < 12 ? 0 : i - 11),
              parent_comment_id:
                i < 12 && i % 3 === 2 ? ctx.id(`comment:${i - 1}`) : null,
              revision: 1,
              mentioned_membership_ids: [ctx.member(0)],
            }
          : group === 2
            ? { project_id: projectId, changed_fields: ['summary'] }
            : { initiative_id: initiativeId };
    const occurredAt = ctx.date(group === 1 ? -8 + i / 6 : -29 + i * 1.2);
    const actorId = ctx.member(group === 1 ? i % 6 : 1 + (i % 4));
    // Repeated planning aggregates advance their revision consistently.
    const aggregateVersion =
      group < 2
        ? 1
        : group === 2
          ? 1 + Math.floor(i / 12)
          : 1 + Math.floor(i / 8);
    contracts.validateEnvelope({
      id: ctx.id(`event:${i}`),
      workspace_id: ctx.workspaceId,
      event_type: eventType,
      schema_version: group === 1 ? 3 : 1,
      actor_membership_id: actorId,
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      aggregate_version: aggregateVersion,
      occurred_at: occurredAt.toISOString(),
      payload,
    });
    await ctx.tx.insert(events).values({
      id: ctx.id(`event:${i}`),
      workspaceId: ctx.workspaceId,
      eventType,
      schemaVersion: group === 1 ? 3 : 1,
      actorId,
      aggregateType,
      aggregateId,
      aggregateVersion,
      correlationId: ctx.id(`correlation:${i}`),
      occurredAt,
      createdAt: occurredAt,
      payload,
    });
    await ctx.tx
      .insert(eventAggregateHeads)
      .values({
        workspaceId: ctx.workspaceId,
        aggregateType,
        aggregateId,
        revision: aggregateVersion,
      })
      .onConflictDoUpdate({
        target: [
          eventAggregateHeads.workspaceId,
          eventAggregateHeads.aggregateType,
          eventAggregateHeads.aggregateId,
        ],
        set: { revision: aggregateVersion },
      });
    await ctx.tx.insert(eventDispatchAttempts).values({
      id: ctx.id(`dispatch:${i}`),
      eventId: ctx.id(`event:${i}`),
      consumerKey: 'notifications.fanout.v1',
      status: 'SUCCEEDED',
      attemptCount: 1,
      availableAt: occurredAt,
      completedAt: occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
    await ctx.tx.insert(eventConsumerReceipts).values({
      eventId: ctx.id(`event:${i}`),
      consumerKey: 'notifications.fanout.v1',
      processedAt: occurredAt,
    });
    await ctx.tx.insert(auditLogs).values({
      id: ctx.id(`audit:${i}`),
      workspaceId: ctx.workspaceId,
      actorId,
      correlationId: ctx.id(`correlation:${i}`),
      action: eventType,
      targetType: aggregateType,
      targetId: aggregateId,
      createdAt: occurredAt,
      metadata: {
        ...payload,
        source: 'northstar-demo',
        summary: [
          'Launch readiness work assigned for the customer portal rollout.',
          'Acceptance criteria clarified after the mobile beta review.',
          'Weekly customer portal delivery summary published.',
          'Launch initiative reviewed with customer success and engineering.',
        ][group],
      },
    });
  }
  // The monitor defaults to failed/quarantined deliveries. Keep preview-only
  // history visible without creating runnable jobs or implying real delivery.
  await ctx.tx.insert(eventDispatchAttempts).values(
    [0, 1].map((i) => ({
      id: ctx.id(`dispatch-preview:${i}`),
      eventId: ctx.id(`event:${i}`),
      consumerKey: 'demo.preview.v1',
      status: 'QUARANTINED' as const,
      attemptCount: 1,
      availableAt: ctx.date(-2),
      completedAt: ctx.date(-2),
      lastError:
        'Demo simulation: customer preview integration is unsupported; delivery quarantined without retry.',
      createdAt: ctx.date(-3),
      updatedAt: ctx.date(-2),
    })),
  );
}
