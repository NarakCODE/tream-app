import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectAccessService } from './project-access.service';
import type { ProjectRepository } from '../infrastructure/project.repository';
import type { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import type { TeamAccessService } from '../../teams/application/team-access.service';
import type { DatabaseTransaction } from '../../../database/transaction';
describe('Project all-team authorization', () => {
  const tx = {} as DatabaseTransaction;
  const repository = {
    project: jest.fn(),
    links: jest.fn(),
    member: jest.fn(),
  };
  const workspace = { require: jest.fn() };
  const teams = { require: jest.fn() };
  const access = new ProjectAccessService(
    workspace as unknown as WorkspaceAuthorizationService,
    teams as unknown as TeamAccessService,
    repository as unknown as ProjectRepository,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    workspace.require.mockResolvedValue({
      member: { id: 'membership', role: 'MEMBER' },
    });
    repository.project.mockResolvedValue({
      id: 'project',
      leadId: null,
      archivedAt: null,
      deletedAt: null,
    });
    repository.links.mockResolvedValue([{ teamId: 'a' }, { teamId: 'b' }]);
    repository.member.mockResolvedValue(undefined);
    teams.require.mockResolvedValue({ share: { role: 'MEMBER' } });
  });
  it('hides a project when any linked private team is inaccessible', async () => {
    teams.require
      .mockResolvedValueOnce({ share: { role: 'MEMBER' } })
      .mockRejectedValueOnce(new NotFoundException('Team not found.'));
    await expect(
      access.require(tx, 'user', 'workspace', 'project'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(teams.require).toHaveBeenCalledTimes(2);
  });
  it('locks existing and newly linked teams in one sorted order', async () => {
    repository.links.mockResolvedValue([{ teamId: 'z' }, { teamId: 'b' }]);
    repository.project.mockResolvedValue({
      id: 'project',
      leadId: 'membership',
      archivedAt: null,
      deletedAt: null,
    });
    await access.require(
      tx,
      'user',
      'workspace',
      'project',
      'manage',
      true,
      false,
      ['a'],
    );
    expect(teams.require.mock.calls.map((call: unknown[]) => call[3])).toEqual([
      'a',
      'b',
      'z',
    ]);
    expect(teams.require).toHaveBeenNthCalledWith(
      1,
      tx,
      'user',
      'workspace',
      'a',
      'write',
      true,
      false,
    );
    expect(teams.require).toHaveBeenNthCalledWith(
      2,
      tx,
      'user',
      'workspace',
      'b',
      'read',
      true,
      true,
    );
  });
  it('denies guests before reading project relationships', async () => {
    workspace.require.mockResolvedValue({
      member: { id: 'membership', role: 'GUEST' },
    });
    await expect(
      access.require(tx, 'user', 'workspace', 'project'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.project).not.toHaveBeenCalled();
  });
  it('requires administration of every team when no project relationship exists', async () => {
    teams.require
      .mockResolvedValueOnce({ share: { role: 'ADMIN' } })
      .mockResolvedValueOnce({ share: { role: 'MEMBER' } });
    await expect(
      access.require(tx, 'user', 'workspace', 'project', 'manage'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    teams.require.mockResolvedValue({ share: { role: 'ADMIN' } });
    await expect(
      access.require(tx, 'user', 'workspace', 'project', 'manage'),
    ).resolves.toHaveProperty('project.id', 'project');
  });
  it('preserves private visibility for workspace owners', async () => {
    workspace.require.mockResolvedValue({
      member: { id: 'membership', role: 'OWNER' },
    });
    teams.require.mockRejectedValue(new NotFoundException('Team not found.'));
    await expect(
      access.require(tx, 'user', 'workspace', 'project', 'manage'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('makes archived projects readable but denies normal mutations', async () => {
    repository.project.mockResolvedValue({
      id: 'project',
      leadId: 'membership',
      archivedAt: new Date(),
      deletedAt: null,
    });
    await expect(
      access.require(tx, 'user', 'workspace', 'project'),
    ).resolves.toHaveProperty('project.id', 'project');
    await expect(
      access.require(tx, 'user', 'workspace', 'project', 'manage'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      access.require(tx, 'user', 'workspace', 'project', 'manage', true, true),
    ).resolves.toHaveProperty('project.id', 'project');
  });
});
