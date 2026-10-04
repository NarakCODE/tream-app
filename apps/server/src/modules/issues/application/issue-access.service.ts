import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { TeamAccessService } from '../../teams/application/team-access.service';
import { ProjectAccessService } from '../../projects/application/project-access.service';
import { IssueRepository } from '../infrastructure/issue.repository';
@Injectable()
export class IssueAccessService {
  constructor(
    private readonly workspace: WorkspaceAuthorizationService,
    private readonly teams: TeamAccessService,
    private readonly projects: ProjectAccessService,
    private readonly repository: IssueRepository,
  ) {}
  async require(
    tx: Tx,
    userId: string,
    workspaceId: string,
    issueId: string,
    mode: 'read' | 'write' = 'read',
    lock = false,
    allowInactive = false,
  ) {
    await this.workspace.require(tx, userId, workspaceId, 'workspace.read', {
      lock,
    });
    const initial = await this.repository.find(tx, workspaceId, issueId);
    if (!initial) throw new NotFoundException('Issue not found.');
    const { member, team } = await this.teams.require(
      tx,
      userId,
      workspaceId,
      initial.teamId,
      mode,
      lock,
      true,
    );
    if (initial.projectId)
      await this.projects.require(
        tx,
        userId,
        workspaceId,
        initial.projectId,
        'read',
        lock,
        true,
      );
    let parentId = initial.parentId;
    const seen = new Set<string>([initial.id]);
    while (parentId) {
      if (seen.has(parentId) || seen.size >= 1000)
        throw new NotFoundException('Issue not found.');
      seen.add(parentId);
      const parent = await this.repository.find(tx, workspaceId, parentId);
      if (!parent) throw new NotFoundException('Issue not found.');
      try {
        await this.teams.require(
          tx,
          userId,
          workspaceId,
          parent.teamId,
          'read',
          lock,
          true,
        );
        if (parent.projectId)
          await this.projects.require(
            tx,
            userId,
            workspaceId,
            parent.projectId,
            'read',
            lock,
            true,
          );
      } catch (error) {
        if (
          error instanceof ForbiddenException ||
          error instanceof NotFoundException
        )
          throw new NotFoundException('Issue not found.');
        throw error;
      }
      parentId = parent.parentId;
    }
    const issue = lock
      ? (await this.repository.find(tx, workspaceId, issueId, true))!
      : initial;
    if (
      mode === 'write' &&
      !allowInactive &&
      (issue.archivedAt || issue.deletedAt || team.retiredAt)
    )
      throw new ConflictException('Issue or team is inactive.');
    return { issue, member, team };
  }
}
