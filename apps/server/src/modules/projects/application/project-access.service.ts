import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { TeamAccessService } from '../../teams/application/team-access.service';
import { ProjectRepository } from '../infrastructure/project.repository';
import { canManageProject } from '../domain/project-policy';
@Injectable()
export class ProjectAccessService {
  constructor(
    private readonly workspace: WorkspaceAuthorizationService,
    private readonly teams: TeamAccessService,
    private readonly repository: ProjectRepository,
  ) {}
  async require(
    tx: Tx,
    userId: string,
    workspaceId: string,
    projectId: string,
    mode: 'read' | 'manage' = 'read',
    lock = false,
    allowInactive = false,
    additionalTeamIds: string[] = [],
  ) {
    const { member } = await this.workspace.require(
      tx,
      userId,
      workspaceId,
      'workspace.read',
      { lock },
    );
    if (member.role === 'GUEST')
      throw new ForbiddenException('Project permission denied.');
    const project = await this.repository.project(
      tx,
      workspaceId,
      projectId,
      lock,
    );
    if (!project || (project.deletedAt && !allowInactive))
      throw new NotFoundException('Project not found.');
    const links = await this.repository.links(tx, projectId);
    let allTeamAdmin = links.length > 0;
    const linkedIds = new Set(links.map((link) => link.teamId));
    const teamIds = [...new Set([...linkedIds, ...additionalTeamIds])].sort();
    for (const teamId of teamIds) {
      const existing = linkedIds.has(teamId);
      const { share } = await this.teams.require(
        tx,
        userId,
        workspaceId,
        teamId,
        existing ? 'read' : 'write',
        lock,
        existing,
      );
      if (existing) allTeamAdmin = allTeamAdmin && share?.role === 'ADMIN';
    }
    if (mode === 'manage') {
      if ((project.archivedAt || project.deletedAt) && !allowInactive)
        throw new ConflictException('Project is archived or deleted.');
      if (
        !canManageProject(
          member.role,
          project.leadId === member.id,
          !!(await this.repository.member(tx, projectId, member.id)),
          allTeamAdmin,
        )
      )
        throw new ForbiddenException('Project permission denied.');
    }
    return { project, member, links };
  }
}
