import { Injectable, type OnModuleInit } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  notifications,
  notificationDeliveryJobs,
  comments,
  issueSubscribers,
  projectSubscribers,
  initiativeSubscribers,
  projectMembers,
  initiatives,
  projectUpdates,
  initiativeUpdates,
  workspaces,
} from '../../../database/schema';
import type { events } from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { EventConsumerRegistry } from '../../eventing/application/event-consumer-registry';
import { NotificationAccessService } from './notification-access.service';
import { NotificationRepository } from '../infrastructure/notification.repository';
import type {
  NotificationKind,
  NotificationTarget,
} from '../domain/notification-policy';
export const NOTIFICATION_CONSUMER_KEY = 'notifications.fanout.v1';
@Injectable()
export class NotificationConsumer implements OnModuleInit {
  constructor(
    private readonly registry: EventConsumerRegistry,
    private readonly access: NotificationAccessService,
    private readonly repository: NotificationRepository,
  ) {}
  onModuleInit() {
    this.registry.register(NOTIFICATION_CONSUMER_KEY, (tx, event) =>
      this.consume(tx, event),
    );
  }
  async consume(tx: Tx, event: typeof events.$inferSelect) {
    await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, event.workspaceId))
      .for('update');
    const payload = event.payload;
    const recipients = new Map<string, Set<NotificationKind>>();
    let target: NotificationTarget | undefined;
    const add = (id: unknown, kind: NotificationKind) => {
      if (typeof id === 'string' && id !== event.actorId) {
        const kinds = recipients.get(id) ?? new Set<NotificationKind>();
        kinds.add(kind);
        recipients.set(id, kinds);
      }
    };
    if (
      event.eventType === 'issue.assigned' &&
      event.schemaVersion === 1 &&
      typeof payload.issue_id === 'string'
    ) {
      target = { type: 'issue', id: payload.issue_id };
      add(payload.assignee_membership_id, 'ASSIGNMENT');
    } else if (
      ['comment.created', 'comment.updated'].includes(event.eventType) &&
      [1, 2, 3].includes(event.schemaVersion ?? 0) &&
      typeof payload.comment_id === 'string'
    ) {
      const [comment] = await tx
        .select()
        .from(comments)
        .where(
          and(
            eq(comments.workspaceId, event.workspaceId),
            eq(comments.id, payload.comment_id),
          ),
        )
        .limit(1);
      if (!comment || comment.deletedAt) return;
      if (comment.issueId) target = { type: 'issue', id: comment.issueId };
      else if (comment.projectId)
        target = { type: 'project', id: comment.projectId };
      else if (comment.initiativeId)
        target = { type: 'initiative', id: comment.initiativeId };
      else if (comment.projectUpdateId) {
        const [update] = await tx
          .select()
          .from(projectUpdates)
          .where(eq(projectUpdates.id, comment.projectUpdateId))
          .limit(1);
        if (!update || update.deletedAt) return;
        target = { type: 'project', id: update.projectId };
      } else if (comment.initiativeUpdateId) {
        const [update] = await tx
          .select()
          .from(initiativeUpdates)
          .where(eq(initiativeUpdates.id, comment.initiativeUpdateId))
          .limit(1);
        if (!update || update.deletedAt) return;
        target = { type: 'initiative', id: update.initiativeId };
      }
      if (!target) return;
      if (
        event.schemaVersion === 3 &&
        Array.isArray(payload.mentioned_membership_ids)
      )
        for (const id of payload.mentioned_membership_ids) add(id, 'MENTION');
      if (event.eventType === 'comment.created') {
        for (const id of await this.subscribers(tx, target))
          add(id, 'SUBSCRIPTION');
        if (comment.parentCommentId) {
          const [parent] = await tx
            .select()
            .from(comments)
            .where(eq(comments.id, comment.parentCommentId))
            .limit(1);
          if (parent && !parent.deletedAt) add(parent.authorId, 'SUBSCRIPTION');
        }
      }
    } else if (
      event.eventType === 'project.update_published' &&
      event.schemaVersion === 1 &&
      typeof payload.project_id === 'string'
    ) {
      if (typeof payload.update_id !== 'string') return;
      const [update] = await tx
        .select()
        .from(projectUpdates)
        .where(
          and(
            eq(projectUpdates.id, payload.update_id),
            eq(projectUpdates.workspaceId, event.workspaceId),
          ),
        )
        .limit(1);
      if (!update || update.deletedAt) return;
      target = { type: 'project', id: payload.project_id };
      for (const id of await this.subscribers(tx, target))
        add(id, 'PLANNING_UPDATE');
      for (const row of await tx
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.projectId, target.id)))
        add(row.membershipId, 'PLANNING_UPDATE');
    } else if (
      event.eventType === 'initiative.update_published' &&
      event.schemaVersion === 1 &&
      typeof payload.initiative_id === 'string'
    ) {
      if (typeof payload.update_id !== 'string') return;
      const [update] = await tx
        .select()
        .from(initiativeUpdates)
        .where(
          and(
            eq(initiativeUpdates.id, payload.update_id),
            eq(initiativeUpdates.workspaceId, event.workspaceId),
          ),
        )
        .limit(1);
      if (!update || update.deletedAt) return;
      target = { type: 'initiative', id: payload.initiative_id };
      for (const id of await this.subscribers(tx, target))
        add(id, 'PLANNING_UPDATE');
      const [initiative] = await tx
        .select()
        .from(initiatives)
        .where(eq(initiatives.id, target.id))
        .limit(1);
      add(initiative?.ownerId, 'PLANNING_UPDATE');
    } else if (
      event.aggregateType === 'issue' &&
      event.schemaVersion === 1 &&
      [
        'issue.updated',
        'issue.status_changed',
        'issue.transferred',
        'issue.relation_added',
        'issue.relation_removed',
        'issue.label_added',
        'issue.label_removed',
        'issue.cycle_assigned',
      ].includes(event.eventType) &&
      typeof payload.issue_id === 'string'
    ) {
      target = { type: 'issue', id: payload.issue_id };
      for (const id of await this.subscribers(tx, target))
        add(id, 'SUBSCRIPTION');
    }
    if (!target) return;
    for (const [id, kinds] of recipients) {
      const context = await this.access.visibleRecipient(
        tx,
        event.workspaceId,
        id,
        target,
      );
      if (!context) continue;
      const prefs = await this.repository.preference(tx, event.workspaceId, id);
      if (prefs && !prefs.inAppEnabled && !prefs.emailEnabled) continue;
      for (const kind of kinds) {
        const [row] = await tx
          .insert(notifications)
          .values({
            id: randomUUID(),
            workspaceId: event.workspaceId,
            recipientMembershipId: id,
            actorMembershipId: event.actorId,
            eventId: event.id,
            kind,
            ...this.targetColumn(target),
          })
          .onConflictDoNothing({
            target: [
              notifications.eventId,
              notifications.recipientMembershipId,
              notifications.kind,
            ],
          })
          .returning();
        if (row && prefs?.emailEnabled)
          await tx
            .insert(notificationDeliveryJobs)
            .values({
              id: randomUUID(),
              workspaceId: event.workspaceId,
              notificationId: row.id,
              recipientMembershipId: id,
              messageId: randomUUID(),
            })
            .onConflictDoNothing();
      }
    }
  }
  private async subscribers(tx: Tx, target: NotificationTarget) {
    if (target.type === 'issue')
      return (
        await tx
          .select({ id: issueSubscribers.membershipId })
          .from(issueSubscribers)
          .where(eq(issueSubscribers.issueId, target.id))
      ).map((r) => r.id);
    if (target.type === 'project')
      return (
        await tx
          .select({ id: projectSubscribers.membershipId })
          .from(projectSubscribers)
          .where(eq(projectSubscribers.projectId, target.id))
      ).map((r) => r.id);
    if (target.type === 'initiative')
      return (
        await tx
          .select({ id: initiativeSubscribers.membershipId })
          .from(initiativeSubscribers)
          .where(eq(initiativeSubscribers.initiativeId, target.id))
      ).map((r) => r.id);
    return [];
  }
  private targetColumn(target: NotificationTarget) {
    return {
      issueId: target.type === 'issue' ? target.id : null,
      projectId: target.type === 'project' ? target.id : null,
      initiativeId: target.type === 'initiative' ? target.id : null,
      documentId: target.type === 'document' ? target.id : null,
    };
  }
}
