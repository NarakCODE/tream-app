import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import {
  comments,
  projectUpdates,
  initiativeUpdates,
  memberships,
} from '../../../database/schema';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { TeamAccessService } from '../../teams/application/team-access.service';
import { ProjectAccessService } from '../../projects/application/project-access.service';
import { InitiativeAccessService } from '../../initiatives/application/initiative-access.service';
import { IssueAccessService } from '../../issues/application/issue-access.service';
import type { Target } from '../application/collaboration-policy';
@Injectable()
export class CollaborationAccessService {
  constructor(
    readonly workspace: WorkspaceAuthorizationService,
    readonly teams: TeamAccessService,
    readonly projects: ProjectAccessService,
    readonly issues: IssueAccessService,
    readonly initiatives: InitiativeAccessService,
  ) {}
  async target(
    tx: Tx,
    userId: string,
    workspaceId: string,
    target: Target,
    write = false,
    lock = false,
  ) {
    const { member } = await this.workspace.require(
      tx,
      userId,
      workspaceId,
      'workspace.read',
      { lock },
    );
    if (write && member.role === 'GUEST')
      throw new ForbiddenException(
        'Guests cannot write collaboration resources.',
      );
    if (target.targetType === 'issue')
      await this.issues.require(
        tx,
        userId,
        workspaceId,
        target.targetId,
        write ? 'write' : 'read',
        lock,
      );
    else if (
      target.targetType === 'initiative' ||
      target.targetType === 'initiative_update'
    ) {
      let id = target.targetId;
      if (target.targetType === 'initiative_update') {
        const [update] = await tx
          .select()
          .from(initiativeUpdates)
          .where(
            and(
              eq(initiativeUpdates.workspaceId, workspaceId),
              eq(initiativeUpdates.id, id),
            ),
          )
          .limit(1);
        if (!update || update.deletedAt)
          throw new NotFoundException('Initiative update not found.');
        id = update.initiativeId;
      }
      const { initiative } = await this.initiatives.require(
        tx,
        userId,
        workspaceId,
        id,
        'read',
        lock,
      );
      if (write && (initiative.archivedAt || initiative.deletedAt))
        throw new ForbiddenException('Initiative is inactive.');
    } else {
      let projectId = target.targetId;
      if (target.targetType === 'project_update') {
        const [update] = await tx
          .select()
          .from(projectUpdates)
          .where(
            and(
              eq(projectUpdates.workspaceId, workspaceId),
              eq(projectUpdates.id, target.targetId),
            ),
          )
          .limit(1);
        if (!update || update.deletedAt)
          throw new NotFoundException('Project update not found.');
        projectId = update.projectId;
      }
      // Commenting and subscribing only require visibility; structural label changes use manage below.
      await this.projects.require(
        tx,
        userId,
        workspaceId,
        projectId,
        'read',
        lock,
      );
      if (write) {
        const { project } = await this.projects.require(
          tx,
          userId,
          workspaceId,
          projectId,
          'read',
        );
        if (project.archivedAt || project.deletedAt)
          throw new ForbiddenException('Project is inactive.');
      }
    }
    return member;
  }
  async scope(
    tx: Tx,
    userId: string,
    workspaceId: string,
    teamId: string | null | undefined,
    write = false,
    lock = false,
  ) {
    const { member } = await this.workspace.require(
      tx,
      userId,
      workspaceId,
      'workspace.read',
      { lock },
    );
    if (teamId)
      await this.teams.require(
        tx,
        userId,
        workspaceId,
        teamId,
        write ? 'manage' : 'read',
        lock,
      );
    else if (write && !['OWNER', 'ADMIN'].includes(member.role))
      throw new ForbiddenException(
        'Workspace collaboration settings require an administrator.',
      );
    return member;
  }
  targetOf(comment: typeof comments.$inferSelect): Target {
    if (comment.issueId)
      return { targetType: 'issue', targetId: comment.issueId };
    if (comment.projectId)
      return { targetType: 'project', targetId: comment.projectId };
    if (comment.projectUpdateId)
      return {
        targetType: 'project_update',
        targetId: comment.projectUpdateId,
      };
    if (comment.initiativeId)
      return { targetType: 'initiative', targetId: comment.initiativeId };
    return {
      targetType: 'initiative_update',
      targetId: comment.initiativeUpdateId!,
    };
  }
  async mentions(tx: Tx, workspaceId: string, target: Target, ids: string[]) {
    for (const id of ids) {
      const [member] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.id, id),
            eq(memberships.state, 'ACTIVE'),
          ),
        )
        .limit(1);
      if (!member) throw new NotFoundException('Mention recipient not found.');
      await this.target(tx, member.userId, workspaceId, target);
    }
  }
  async comment(
    tx: Tx,
    userId: string,
    workspaceId: string,
    id: string,
    write = false,
    lock = false,
    allowDeleted = false,
  ) {
    const [comment] = await tx
      .select()
      .from(comments)
      .where(and(eq(comments.workspaceId, workspaceId), eq(comments.id, id)))
      .limit(1);
    if (!comment || (!allowDeleted && comment.deletedAt))
      throw new NotFoundException('Comment not found.');
    const member = await this.target(
      tx,
      userId,
      workspaceId,
      this.targetOf(comment),
      write,
      lock,
    );
    return { comment, member };
  }
}
