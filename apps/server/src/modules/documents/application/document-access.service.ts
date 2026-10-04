import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { documents } from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { TeamAccessService } from '../../teams/application/team-access.service';
import { ProjectAccessService } from '../../projects/application/project-access.service';
import { InitiativeAccessService } from '../../initiatives/application/initiative-access.service';
export type DocumentOwner = {
  ownerType: 'project' | 'team' | 'initiative';
  ownerId: string;
};
@Injectable()
export class DocumentAccessService {
  constructor(
    readonly workspace: WorkspaceAuthorizationService,
    readonly teams: TeamAccessService,
    readonly projects: ProjectAccessService,
    readonly initiatives: InitiativeAccessService,
  ) {}
  ownerOf(row: typeof documents.$inferSelect): DocumentOwner {
    return row.projectId
      ? { ownerType: 'project', ownerId: row.projectId }
      : row.teamId
        ? { ownerType: 'team', ownerId: row.teamId }
        : { ownerType: 'initiative', ownerId: row.initiativeId! };
  }
  async owner(
    tx: Tx,
    userId: string,
    w: string,
    owner: DocumentOwner,
    write = false,
    lock = false,
    manage = false,
  ) {
    const { member } = await this.workspace.require(
      tx,
      userId,
      w,
      'workspace.read',
      { lock },
    );
    if (member.role === 'GUEST')
      throw new ForbiddenException('Document permission denied.');
    if (owner.ownerType === 'team')
      await this.teams.require(
        tx,
        userId,
        w,
        owner.ownerId,
        manage ? 'manage' : write ? 'write' : 'read',
        lock,
        !write,
      );
    else if (owner.ownerType === 'project') {
      const { project } = await this.projects.require(
        tx,
        userId,
        w,
        owner.ownerId,
        manage ? 'manage' : 'read',
        lock,
      );
      if (write && project.archivedAt)
        throw new ConflictException('Document owner is inactive.');
    } else {
      const { initiative } = await this.initiatives.require(
        tx,
        userId,
        w,
        owner.ownerId,
        manage ? 'manage' : 'read',
        lock,
      );
      if (write && initiative.archivedAt)
        throw new ConflictException('Document owner is inactive.');
    }
    return member;
  }
  async require(
    tx: Tx,
    userId: string,
    w: string,
    id: string,
    mode: 'read' | 'write' = 'read',
    lock = false,
    allowInactive = false,
  ) {
    await this.workspace.require(tx, userId, w, 'workspace.read', { lock });
    const query = tx
      .select()
      .from(documents)
      .where(and(eq(documents.workspaceId, w), eq(documents.id, id)))
      .limit(1);
    const [document] = lock ? await query.for('update') : await query;
    if (!document || (!allowInactive && document.deletedAt))
      throw new NotFoundException('Document not found.');
    const member = await this.owner(
      tx,
      userId,
      w,
      this.ownerOf(document),
      mode === 'write',
      lock,
    );
    if (mode === 'write') {
      if (!allowInactive && (document.archivedAt || document.deletedAt))
        throw new ConflictException('Document is inactive.');
      if (
        document.authorId !== member.id &&
        !['OWNER', 'ADMIN'].includes(member.role)
      )
        await this.owner(
          tx,
          userId,
          w,
          this.ownerOf(document),
          true,
          lock,
          true,
        );
    }
    return { document, member };
  }
}
