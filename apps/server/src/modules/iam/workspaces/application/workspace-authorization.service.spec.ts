import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DatabaseTransaction } from '../../../../database/transaction';
import { WorkspaceAuthorizationService } from './workspace-authorization.service';
import { WorkspaceRepository } from './ports/workspace.repository';
describe('Authoritative workspace authorization', () => {
  const tx = {} as DatabaseTransaction;
  const workspace = jest.fn();
  const membership = jest.fn();
  const repository = {
    workspace,
    membership,
  } as unknown as WorkspaceRepository;
  const service = new WorkspaceAuthorizationService(repository);
  beforeEach(() => {
    workspace.mockResolvedValue({
      id: 'workspace',
      archivedAt: null,
      deletedAt: null,
    });
    membership.mockResolvedValue({
      id: 'member',
      state: 'ACTIVE',
      role: 'MEMBER',
    });
  });
  it('checks database membership every request', async () => {
    await service.require(tx, 'user', 'workspace', 'issue.update');
    membership.mockResolvedValue({
      id: 'member',
      state: 'SUSPENDED',
      role: 'MEMBER',
    });
    await expect(
      service.require(tx, 'user', 'workspace', 'issue.update'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(membership).toHaveBeenCalledWith(tx, 'workspace', 'user');
  });
  it('foreign/missing workspace and absent membership use identical denial', async () => {
    workspace.mockResolvedValue(undefined);
    await expect(
      service.require(tx, 'user', 'foreign', 'workspace.read'),
    ).rejects.toBeInstanceOf(NotFoundException);
    workspace.mockResolvedValue({ deletedAt: null, archivedAt: null });
    membership.mockResolvedValue(undefined);
    await expect(
      service.require(tx, 'user', 'foreign', 'workspace.read'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('deleted workspace denies access immediately', async () => {
    workspace.mockResolvedValue({ deletedAt: new Date(), archivedAt: null });
    await expect(
      service.require(tx, 'user', 'workspace', 'workspace.read'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('archived workspace denies ordinary use but allows explicit lifecycle access', async () => {
    workspace.mockResolvedValue({ deletedAt: null, archivedAt: new Date() });
    await expect(
      service.require(tx, 'user', 'workspace', 'workspace.read'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.require(tx, 'user', 'workspace', 'workspace.read', {
        archived: true,
      }),
    ).resolves.toBeDefined();
  });
  it('guests require future explicit sharing before product access', async () => {
    membership.mockResolvedValue({
      id: 'guest',
      state: 'ACTIVE',
      role: 'GUEST',
    });
    await expect(
      service.require(tx, 'user', 'workspace', 'issue.read'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.require(tx, 'user', 'workspace', 'workspace.read'),
    ).resolves.toBeDefined();
  });
  it('member cannot change workspace settings', async () => {
    await expect(
      service.require(tx, 'user', 'workspace', 'workspace.update'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('requests row lock for serialized membership changes', async () => {
    await service.require(tx, 'user', 'workspace', 'issue.update', {
      lock: true,
    });
    expect(workspace).toHaveBeenCalledWith(tx, 'workspace', true);
  });
});
