import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DatabaseTransaction } from '../../../../database/transaction';
import { WorkspaceRepository } from './ports/workspace.repository';
import { hasPermission, type WorkspacePermission } from '../domain/permissions';
@Injectable()
export class WorkspaceAuthorizationService {
  constructor(private readonly repository: WorkspaceRepository) {}
  async require(
    tx: DatabaseTransaction,
    userId: string,
    workspaceId: string,
    permission: WorkspacePermission,
    options: { lock?: boolean; archived?: boolean; deleted?: boolean } = {},
  ) {
    const workspace = await this.repository.workspace(
      tx,
      workspaceId,
      options.lock,
    );
    const member = await this.repository.membership(tx, workspaceId, userId);
    if (
      !workspace ||
      !member ||
      member.state !== 'ACTIVE' ||
      (workspace.deletedAt && !options.deleted)
    )
      throw new NotFoundException('Workspace not found.');
    if (workspace.archivedAt && !options.archived)
      throw new ForbiddenException('Workspace is archived.');
    if (!hasPermission(member.role, permission))
      throw new ForbiddenException('Permission denied.');
    return { workspace, member };
  }
}
