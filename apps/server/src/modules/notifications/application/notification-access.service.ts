import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import {
  notifications,
  memberships,
  users,
  issues,
  teams,
  events,
  comments,
  projectUpdates,
  initiativeUpdates,
} from '../../../database/schema';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { IssueAccessService } from '../../issues/application/issue-access.service';
import { ProjectAccessService } from '../../projects/application/project-access.service';
import { InitiativeAccessService } from '../../initiatives/application/initiative-access.service';
import { DocumentAccessService } from '../../documents/application/document-access.service';
import type { NotificationTarget } from '../domain/notification-policy';
export type Notification = typeof notifications.$inferSelect;
@Injectable()
export class NotificationAccessService {
  constructor(
    readonly workspace: WorkspaceAuthorizationService,
    readonly issues: IssueAccessService,
    readonly projects: ProjectAccessService,
    readonly initiatives: InitiativeAccessService,
    readonly documents: DocumentAccessService,
  ) {}
  targetOf(row: Notification): NotificationTarget | null {
    return row.issueId
      ? { type: 'issue', id: row.issueId }
      : row.projectId
        ? { type: 'project', id: row.projectId }
        : row.initiativeId
          ? { type: 'initiative', id: row.initiativeId }
          : row.documentId
            ? { type: 'document', id: row.documentId }
            : null;
  }
  async target(
    tx: Tx,
    userId: string,
    w: string,
    target: NotificationTarget,
    lock = false,
  ) {
    if (target.type === 'issue') {
      const { issue, team } = await this.issues.require(
        tx,
        userId,
        w,
        target.id,
        'read',
        lock,
      );
      if (issue.archivedAt || issue.deletedAt || team.retiredAt)
        throw new NotFoundException('Notification source not found.');
      if (issue.projectId) {
        const { project } = await this.projects.require(
          tx,
          userId,
          w,
          issue.projectId,
        );
        if (project.archivedAt || project.deletedAt)
          throw new NotFoundException('Notification source not found.');
      }
      let parentId = issue.parentId;
      const seen = new Set([issue.id]);
      while (parentId) {
        if (seen.has(parentId) || seen.size >= 1000)
          throw new NotFoundException('Notification source not found.');
        seen.add(parentId);
        const [parent] = await tx
          .select()
          .from(issues)
          .where(eq(issues.id, parentId))
          .limit(1);
        if (!parent || parent.archivedAt || parent.deletedAt)
          throw new NotFoundException('Notification source not found.');
        const [parentTeam] = await tx
          .select()
          .from(teams)
          .where(eq(teams.id, parent.teamId))
          .limit(1);
        if (!parentTeam || parentTeam.retiredAt)
          throw new NotFoundException('Notification source not found.');
        if (parent.projectId)
          await this.target(tx, userId, w, {
            type: 'project',
            id: parent.projectId,
          });
        parentId = parent.parentId;
      }
    } else if (target.type === 'project') {
      const { project, links } = await this.projects.require(
        tx,
        userId,
        w,
        target.id,
        'read',
        lock,
      );
      if (project.archivedAt || project.deletedAt)
        throw new NotFoundException('Notification source not found.');
      for (const link of links) {
        const [team] = await tx
          .select()
          .from(teams)
          .where(eq(teams.id, link.teamId))
          .limit(1);
        if (team?.retiredAt)
          throw new NotFoundException('Notification source not found.');
      }
    } else if (target.type === 'initiative') {
      const { initiative, links } = await this.initiatives.require(
        tx,
        userId,
        w,
        target.id,
        'read',
        lock,
      );
      if (initiative.archivedAt || initiative.deletedAt)
        throw new NotFoundException('Notification source not found.');
      for (const link of links)
        await this.target(tx, userId, w, {
          type: 'project',
          id: link.projectId,
        });
    } else {
      const { document } = await this.documents.require(
        tx,
        userId,
        w,
        target.id,
        'read',
        lock,
      );
      if (document.archivedAt || document.deletedAt)
        throw new NotFoundException('Notification source not found.');
      if (document.projectId)
        await this.target(tx, userId, w, {
          type: 'project',
          id: document.projectId,
        });
      if (document.initiativeId)
        await this.target(tx, userId, w, {
          type: 'initiative',
          id: document.initiativeId,
        });
      if (document.teamId) {
        const [team] = await tx
          .select()
          .from(teams)
          .where(eq(teams.id, document.teamId))
          .limit(1);
        if (team?.retiredAt)
          throw new NotFoundException('Notification source not found.');
      }
    }
  }
  async recipient(tx: Tx, w: string, id: string) {
    const [row] = await tx
      .select({ member: memberships, user: users })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.workspaceId, w),
          eq(memberships.id, id),
          eq(memberships.state, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!row || row.user.disabledAt)
      throw new NotFoundException('Notification recipient not found.');
    await this.workspace.require(tx, row.user.id, w, 'workspace.read');
    return row;
  }
  async source(tx: Tx, userId: string, row: Notification, lock = false) {
    const target = this.targetOf(row);
    if (!target) throw new NotFoundException('Notification source not found.');
    await this.target(tx, userId, row.workspaceId, target, lock);
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, row.eventId))
      .limit(1);
    if (!event) throw new NotFoundException('Notification source not found.');
    if (event.eventType.startsWith('comment.')) {
      const commentId = event.payload.comment_id;
      if (typeof commentId !== 'string')
        throw new NotFoundException('Notification source not found.');
      const [comment] = await tx
        .select()
        .from(comments)
        .where(
          and(
            eq(comments.workspaceId, row.workspaceId),
            eq(comments.id, commentId),
          ),
        )
        .limit(1);
      if (!comment || comment.deletedAt)
        throw new NotFoundException('Notification source not found.');
      if (comment.projectUpdateId) {
        const [update] = await tx
          .select()
          .from(projectUpdates)
          .where(eq(projectUpdates.id, comment.projectUpdateId))
          .limit(1);
        if (!update || update.deletedAt)
          throw new NotFoundException('Notification source not found.');
      }
      if (comment.initiativeUpdateId) {
        const [update] = await tx
          .select()
          .from(initiativeUpdates)
          .where(eq(initiativeUpdates.id, comment.initiativeUpdateId))
          .limit(1);
        if (!update || update.deletedAt)
          throw new NotFoundException('Notification source not found.');
      }
    }
    if (event.eventType === 'project.update_published') {
      const id = event.payload.update_id;
      const [update] =
        typeof id === 'string'
          ? await tx
              .select()
              .from(projectUpdates)
              .where(
                and(
                  eq(projectUpdates.workspaceId, row.workspaceId),
                  eq(projectUpdates.id, id),
                ),
              )
              .limit(1)
          : [];
      if (!update || update.deletedAt)
        throw new NotFoundException('Notification source not found.');
    }
    if (event.eventType === 'initiative.update_published') {
      const id = event.payload.update_id;
      const [update] =
        typeof id === 'string'
          ? await tx
              .select()
              .from(initiativeUpdates)
              .where(
                and(
                  eq(initiativeUpdates.workspaceId, row.workspaceId),
                  eq(initiativeUpdates.id, id),
                ),
              )
              .limit(1)
          : [];
      if (!update || update.deletedAt)
        throw new NotFoundException('Notification source not found.');
    }
  }
  async owned(tx: Tx, userId: string, w: string, id: string, lock = false) {
    const { member } = await this.workspace.require(
      tx,
      userId,
      w,
      'workspace.read',
      { lock },
    );
    const query = tx
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, w),
          eq(notifications.id, id),
          eq(notifications.recipientMembershipId, member.id),
        ),
      )
      .limit(1);
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw new NotFoundException('Notification not found.');
    await this.source(tx, userId, row, lock);
    return { row, member };
  }
  async visibleRecipient(
    tx: Tx,
    w: string,
    id: string,
    target: NotificationTarget,
  ) {
    try {
      const context = await this.recipient(tx, w, id);
      await this.target(tx, context.user.id, w, target);
      return context;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        return null;
      throw error;
    }
  }
}
