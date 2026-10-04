import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, asc } from 'drizzle-orm';
import { initiatives, initiativeProjects } from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { ProjectAccessService } from '../../projects/application/project-access.service';
@Injectable()
export class InitiativeAccessService {
  constructor(
    readonly workspace: WorkspaceAuthorizationService,
    readonly projects: ProjectAccessService,
  ) {}
  async require(
    tx: Tx,
    userId: string,
    workspaceId: string,
    id: string,
    mode: 'read' | 'manage' = 'read',
    lock = false,
    allowInactive = false,
  ) {
    const { member } = await this.workspace.require(
      tx,
      userId,
      workspaceId,
      'workspace.read',
      { lock },
    );
    if (member.role === 'GUEST')
      throw new ForbiddenException('Initiative permission denied.');
    const query = tx
      .select()
      .from(initiatives)
      .where(
        and(eq(initiatives.workspaceId, workspaceId), eq(initiatives.id, id)),
      )
      .limit(1);
    const [initiative] = lock ? await query.for('update') : await query;
    if (!initiative || (!allowInactive && initiative.deletedAt))
      throw new NotFoundException('Initiative not found.');
    const links = await tx
      .select()
      .from(initiativeProjects)
      .where(eq(initiativeProjects.initiativeId, id))
      .orderBy(asc(initiativeProjects.projectId));
    for (const link of links) {
      try {
        await this.projects.require(
          tx,
          userId,
          workspaceId,
          link.projectId,
          'read',
          lock,
          true,
        );
      } catch (error) {
        if (
          error instanceof NotFoundException ||
          error instanceof ForbiddenException
        )
          throw new NotFoundException('Initiative not found.');
        throw error;
      }
    }
    if (mode === 'manage') {
      if (!allowInactive && (initiative.archivedAt || initiative.deletedAt))
        throw new ConflictException('Initiative is inactive.');
      if (
        !['OWNER', 'ADMIN'].includes(member.role) &&
        initiative.ownerId !== member.id
      )
        throw new ForbiddenException(
          'Initiative management requires its lead or an administrator.',
        );
    }
    return { initiative, member, links };
  }
}
