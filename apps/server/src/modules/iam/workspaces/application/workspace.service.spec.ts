import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { DatabaseTransaction } from '../../../../database/transaction';
import type { DatabaseService } from '../../../../database/database.service';
import type { CommandBus } from '../../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput } from '../../../../common/idempotency/idempotency.types';
import type { EventWriter } from '../../../eventing/application/event-writer.service';
import { WorkspaceService } from './workspace.service';
import { WorkspaceAuthorizationService } from './workspace-authorization.service';
import {
  WorkspaceRepository,
  type Membership,
} from './ports/workspace.repository';
import type { InvitationDeliveryService } from './invitation-delivery.service';
describe('Transactional workspace commands', () => {
  const tx = {} as DatabaseTransaction;
  const identity: IdempotencyReservationInput = {
    userId: 'actor',
    method: 'PATCH',
    route: '/workspaces/w',
    key: 'key',
    requestHash: 'hash',
  };
  const actor: Membership = {
    id: 'actor-member',
    workspaceId: 'w',
    userId: 'actor',
    role: 'OWNER',
    state: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const invitation = {
    id: 'inv',
    workspaceId: 'w',
    email: 'invitee@example.com',
    role: 'MEMBER' as const,
    invitedBy: actor.id,
    acceptedBy: null,
    acceptedAt: null,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    tokenHash: 'secret-hash',
  };
  const repositoryMock = {
    workspace: jest.fn(),
    membership: jest.fn(),
    members: jest.fn(),
    saveMember: jest.fn(),
    expireInvitations: jest.fn(),
    saveInvitation: jest.fn(),
    invitationByHash: jest.fn(),
    invitation: jest.fn(),
    user: jest.fn(),
    updateInvitation: jest.fn(),
  };
  const repository = repositoryMock as unknown as WorkspaceRepository;
  const authorize = new WorkspaceAuthorizationService(repository);
  const bus = {
    async execute<T>(
      _identity: IdempotencyReservationInput,
      handler: (tx: DatabaseTransaction) => Promise<T>,
      options: { authorize?: (tx: DatabaseTransaction) => Promise<void> } = {},
    ) {
      await options.authorize?.(tx);
      return handler(tx);
    },
  } as unknown as CommandBus;
  const append = jest.fn().mockResolvedValue(undefined);
  const enqueue = jest.fn().mockResolvedValue(undefined);
  const service = new WorkspaceService(
    {} as DatabaseService,
    repository,
    authorize,
    bus,
    { append } as unknown as EventWriter,
    { append },
    { enqueue } as unknown as InvitationDeliveryService,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.workspace.mockResolvedValue({
      id: 'w',
      archivedAt: null,
      deletedAt: null,
    });
    repositoryMock.membership.mockResolvedValue(actor);
    repositoryMock.members.mockResolvedValue([actor]);
    repositoryMock.saveMember.mockImplementation(
      (_tx: DatabaseTransaction, value: Membership) => Promise.resolve(value),
    );
    repositoryMock.saveInvitation.mockResolvedValue(invitation);
    repositoryMock.invitationByHash.mockResolvedValue(invitation);
    repositoryMock.invitation.mockResolvedValue(invitation);
    repositoryMock.user.mockResolvedValue({
      email: 'invitee@example.com',
      emailVerifiedAt: new Date(),
    });
  });
  it('rejects final owner leave before state/events change', async () => {
    await expect(service.leave(identity, 'w')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repositoryMock.saveMember).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });
  it('rejects final owner role downgrade and suspension', async () => {
    await expect(
      service.changeMember(identity, 'w', actor.id, { role: 'ADMIN' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.changeMember(identity, 'w', actor.id, { state: 'SUSPENDED' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('allows departure after another active owner exists', async () => {
    repositoryMock.members.mockResolvedValue([
      actor,
      { ...actor, id: 'second', userId: 'second' },
    ]);
    await expect(service.leave(identity, 'w')).resolves.toMatchObject({
      state: 'LEFT',
    });
    expect(repositoryMock.workspace).toHaveBeenCalledWith(tx, 'w', true);
  });
  it('admin cannot promote themselves to owner', async () => {
    const admin = { ...actor, role: 'ADMIN' };
    repositoryMock.membership.mockResolvedValue(admin);
    repositoryMock.members.mockResolvedValue([
      admin,
      { ...actor, id: 'owner', userId: 'owner' },
    ]);
    await expect(
      service.changeMember(identity, 'w', admin.id, { role: 'OWNER' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('admin cannot grant ADMIN invitations', async () => {
    repositoryMock.membership.mockResolvedValue({ ...actor, role: 'ADMIN' });
    await expect(
      service.invite(identity, 'w', { email: 'a@example.com', role: 'ADMIN' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(enqueue).not.toHaveBeenCalled();
  });
  it('normalizes invitation email, replaces expired rows, delivers secret privately', async () => {
    const response = await service.invite(identity, 'w', {
      email: 'Invitee@Example.com',
      role: 'MEMBER',
    });
    expect(repositoryMock.expireInvitations).toHaveBeenCalledWith(
      tx,
      'w',
      'invitee@example.com',
      expect.any(Date),
    );
    expect(response).not.toHaveProperty('tokenHash');
    expect(enqueue).toHaveBeenCalledWith(
      tx,
      invitation,
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    );
    expect(JSON.stringify(append.mock.calls)).not.toContain('secret-hash');
  });
  it('requires verified matching email before accepting', async () => {
    repositoryMock.user.mockResolvedValue({
      email: 'other@example.com',
      emailVerifiedAt: new Date(),
    });
    await expect(service.accept(identity, 'secret')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    repositoryMock.user.mockResolvedValue({
      email: 'invitee@example.com',
      emailVerifiedAt: null,
    });
    await expect(service.accept(identity, 'secret')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repositoryMock.saveMember).not.toHaveBeenCalled();
  });
  it.each(['revoked', 'expired', 'accepted'])(
    'denies %s invitation',
    async (state) => {
      repositoryMock.invitation.mockResolvedValue({
        ...invitation,
        ...(state === 'revoked'
          ? { revokedAt: new Date() }
          : state === 'expired'
            ? { expiresAt: new Date(0) }
            : { acceptedAt: new Date() }),
      });
      await expect(service.accept(identity, 'secret')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repositoryMock.saveMember).not.toHaveBeenCalled();
    },
  );
  it('denies invitations whose issuer lost privilege', async () => {
    repositoryMock.members.mockResolvedValue([{ ...actor, role: 'MEMBER' }]);
    repositoryMock.membership.mockResolvedValue({ ...actor, role: 'MEMBER' });
    await expect(service.accept(identity, 'secret')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
