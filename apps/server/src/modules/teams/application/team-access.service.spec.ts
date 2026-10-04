import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TeamAccessService } from './team-access.service';
import { TeamRepository } from '../infrastructure/team.repository';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import type { DatabaseTransaction } from '../../../database/transaction';
describe('TeamAccessService', () => {
  const tx = {} as DatabaseTransaction;
  let workspace: { require: jest.Mock },
    repository: { team: jest.Mock; member: jest.Mock },
    service: TeamAccessService;
  beforeEach(() => {
    workspace = {
      require: jest
        .fn()
        .mockResolvedValue({ member: { id: 'm', role: 'OWNER' } }),
    };
    repository = {
      team: jest
        .fn()
        .mockResolvedValue({ id: 't', visibility: 'PRIVATE', retiredAt: null }),
      member: jest.fn().mockResolvedValue(undefined),
    };
    service = new TeamAccessService(
      workspace as unknown as WorkspaceAuthorizationService,
      repository as unknown as TeamRepository,
    );
  });
  it('does not let ownership expose an unshared private team', async () => {
    await expect(
      service.require(tx, 'u', 'w', 't', 'manage', true),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(workspace.require).toHaveBeenCalledWith(
      tx,
      'u',
      'w',
      'workspace.read',
      { lock: true },
    );
  });
  it('lets a current scoped member administer without workspace elevation', async () => {
    workspace.require.mockResolvedValue({
      member: { id: 'm', role: 'MEMBER' },
    });
    repository.member.mockResolvedValue({ role: 'ADMIN' });
    await expect(
      service.require(tx, 'u', 'w', 't', 'manage'),
    ).resolves.toHaveProperty('member.role', 'MEMBER');
  });
  it('denies a shared guest every write', async () => {
    workspace.require.mockResolvedValue({ member: { id: 'm', role: 'GUEST' } });
    repository.member.mockResolvedValue({ role: 'MEMBER' });
    await expect(
      service.require(tx, 'u', 'w', 't', 'read'),
    ).resolves.toBeDefined();
    await expect(
      service.require(tx, 'u', 'w', 't', 'write'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects new work on retired teams while allowing explicit historical reads', async () => {
    repository.team.mockResolvedValue({
      id: 't',
      visibility: 'WORKSPACE',
      retiredAt: new Date(),
    });
    await expect(
      service.require(tx, 'u', 'w', 't', 'write'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.require(tx, 'u', 'w', 't', 'read', false, true),
    ).resolves.toBeDefined();
  });
});
