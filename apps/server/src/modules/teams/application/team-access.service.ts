import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DatabaseTransaction } from '../../../database/transaction';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { TeamRepository } from '../infrastructure/team.repository';
import { canManageTeam, canReadTeam } from '../domain/team-policy';
@Injectable()
export class TeamAccessService {
  constructor(
    private readonly workspace: WorkspaceAuthorizationService,
    private readonly repository: TeamRepository,
  ) {}
  async require(
    tx: DatabaseTransaction,
    userId: string,
    workspaceId: string,
    teamId: string,
    mode: 'read' | 'write' | 'manage' = 'read',
    lock = false,
    allowRetired = false,
  ) {
    const { member } = await this.workspace.require(
      tx,
      userId,
      workspaceId,
      'workspace.read',
      { lock },
    );
    const team = await this.repository.team(tx, workspaceId, teamId, lock);
    const share = team
      ? await this.repository.member(tx, teamId, member.id)
      : undefined;
    if (!team || !canReadTeam(member.role, team.visibility, share?.role))
      throw new NotFoundException('Team not found.');
    if (team.retiredAt && !allowRetired)
      throw new ConflictException('Team is retired.');
    if (
      mode !== 'read' &&
      (member.role === 'GUEST' ||
        (mode === 'manage' && !canManageTeam(member.role, share?.role)))
    )
      throw new ForbiddenException('Team permission denied.');
    return { team, member, share };
  }
}
