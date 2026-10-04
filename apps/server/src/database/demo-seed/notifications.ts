import {
  notificationDeliveryJobs,
  notificationPreferences,
  notifications,
} from '../schema/notification.schema';
import type { DemoContext } from './context';

export async function seedNotifications(ctx: DemoContext): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await ctx.tx.insert(notificationPreferences).values({
      id: ctx.id(`notification-preference:${i}`),
      workspaceId: ctx.workspaceId,
      recipientMembershipId: ctx.member(i),
      inAppEnabled: true,
      emailEnabled: false,
      createdAt: ctx.date(-35),
      updatedAt: ctx.date(-2),
    });
  }
  const kinds = [
    'ASSIGNMENT',
    'MENTION',
    'SUBSCRIPTION',
    'PLANNING_UPDATE',
  ] as const;
  for (let i = 0; i < 24; i++) {
    const group = i % 4;
    const occurredAt = ctx.date(group === 1 ? -8 + i / 6 : -29 + i * 1.2);
    const recipientMembershipId = ctx.member(0);
    const notificationId = ctx.id(`notification:${i}`);
    await ctx.tx.insert(notifications).values({
      id: notificationId,
      workspaceId: ctx.workspaceId,
      recipientMembershipId,
      actorMembershipId: ctx.member(group === 1 ? i % 6 : 1 + (i % 4)),
      eventId: ctx.id(`event:${i}`),
      kind: kinds[group]!,
      issueId:
        group === 0
          ? ctx.issue(i)
          : group === 1
            ? ctx.issue(i < 12 ? 0 : i - 11)
            : null,
      projectId: group === 2 ? ctx.project(i % 12) : null,
      initiativeId: group === 3 ? ctx.id(`initiative:${i % 8}`) : null,
      title: [
        'Customer portal launch work assigned to you',
        'Your feedback is needed on mobile beta acceptance criteria',
        'A project you follow has a new delivery summary',
        'Northstar launch readiness has been updated',
      ][group],
      body: [
        'Review the acceptance criteria and coordinate the handoff before the launch readiness review.',
        'The team highlighted an accessibility question for your review before the next beta build.',
        'Customer success approved the pilot cohort. Engineering is tracking the remaining release blockers.',
        'The launch plan now includes the mobile beta feedback and the portal rollout checkpoint.',
      ][group],
      readAt: i % 3 === 0 ? new Date(occurredAt.getTime() + 3600000) : null,
      archivedAt: i % 8 === 0 ? new Date(occurredAt.getTime() + 7200000) : null,
      snoozedUntil: i === 21 ? ctx.date(2) : null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
    // These are simulated historical receipts, not proof of external delivery.
    // Only terminal states are used, so no email can be sent by a worker.
    await ctx.tx.insert(notificationDeliveryJobs).values({
      id: ctx.id(`notification-delivery:${i}`),
      workspaceId: ctx.workspaceId,
      notificationId,
      recipientMembershipId,
      channel: 'EMAIL',
      status: 'SUCCEEDED',
      runAfter: occurredAt,
      attemptCount: 1,
      messageId: `<${ctx.id(`notification-delivery:${i}`)}@demo.northstar.invalid>`,
      providerReceipt: `demo-simulated:${ctx.id(`notification-delivery:${i}`)}`,
      completedAt: occurredAt,
      sentAt: occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  }
}
