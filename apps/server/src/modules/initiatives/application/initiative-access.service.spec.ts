import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InitiativeAccessService } from './initiative-access.service';
import type { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import type { ProjectAccessService } from '../../projects/application/project-access.service';
import type { DatabaseTransaction } from '../../../database/transaction';
function fixture(role = 'MEMBER', ownerId = 'lead') {
  const workspace = {
    require: jest.fn().mockResolvedValue({ member: { id: 'member', role } }),
  };
  const projects = { require: jest.fn().mockResolvedValue({ project: {} }) };
  const rows = [
    [
      {
        id: 'initiative',
        workspaceId: 'workspace',
        ownerId,
        archivedAt: null,
        deletedAt: null,
      },
    ],
    [{ projectId: 'public' }, { projectId: 'private' }],
  ];
  const tx = {
    select: () => {
      const result = rows.shift()!;
      return {
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(result),
            orderBy: () => Promise.resolve(result),
          }),
        }),
      };
    },
  };
  const service = new InitiativeAccessService(
    workspace as unknown as WorkspaceAuthorizationService,
    projects as unknown as ProjectAccessService,
  );
  return { service, projects, tx: tx as unknown as DatabaseTransaction };
}
describe('InitiativeAccessService privacy', () => {
  it('checks every linked project before returning even to workspace owners', async () => {
    const { service, projects, tx } = fixture('OWNER');
    await service.require(tx, 'user', 'workspace', 'initiative');
    expect(projects.require).toHaveBeenNthCalledWith(
      1,
      tx,
      'user',
      'workspace',
      'public',
      'read',
      false,
      true,
    );
    expect(projects.require).toHaveBeenNthCalledWith(
      2,
      tx,
      'user',
      'workspace',
      'private',
      'read',
      false,
      true,
    );
  });
  it('hides the whole initiative if any linked project is hidden', async () => {
    const { service, projects, tx } = fixture();
    projects.require
      .mockResolvedValueOnce({ project: {} })
      .mockRejectedValueOnce(new NotFoundException());
    await expect(
      service.require(tx, 'user', 'workspace', 'initiative'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('denies guests before inspecting initiative metadata', async () => {
    const { service, projects, tx } = fixture('GUEST');
    await expect(
      service.require(tx, 'user', 'workspace', 'initiative'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(projects.require).not.toHaveBeenCalled();
  });
  it('does not grant management merely because every project is visible', async () => {
    const { service, tx } = fixture();
    await expect(
      service.require(tx, 'user', 'workspace', 'initiative', 'manage'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows the explicit lead to manage after all project checks', async () => {
    const { service, projects, tx } = fixture('MEMBER', 'member');
    await service.require(tx, 'user', 'workspace', 'initiative', 'manage');
    expect(projects.require).toHaveBeenCalledTimes(2);
  });
});
