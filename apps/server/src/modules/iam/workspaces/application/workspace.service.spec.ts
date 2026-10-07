import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { DatabaseTransaction } from '../../../../database/transaction';
import type { DatabaseService } from '../../../../database/database.service';
import type { CommandBus } from '../../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput } from '../../../../common/idempotency/idempotency.types';
import type { EventWriter } from '../../../eventing/application/event-writer.service';
import type { AuditWriter } from '../../../audit/application/audit-writer.service';
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
    onboardingCompletedAt: null,
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
    selection: jest.fn(),
    select: jest.fn(),
    create: jest.fn(),
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
    {
      db: {
        transaction: (handler: (tx: DatabaseTransaction) => Promise<unknown>) =>
          handler(tx),
      },
    } as unknown as DatabaseService,
    repository,
    authorize,
    bus,
    { append } as unknown as EventWriter,
    { append } as unknown as AuditWriter,
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
    repositoryMock.selection.mockResolvedValue('w');
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
  it('returns selected workspace and membership while preserving workspaceId', async () => {
    await expect(service.active('actor')).resolves.toEqual({
      workspaceId: 'w',
      workspace: { id: 'w', archivedAt: null, deletedAt: null },
      membership: actor,
    });
  });
  it('returns null when no workspace is selected', async () => {
    repositoryMock.selection.mockResolvedValue(null);
    await expect(service.active('actor')).resolves.toBeNull();
    expect(repositoryMock.workspace).not.toHaveBeenCalled();
  });
  it.each(['missing', 'archived', 'deleted', 'suspended', 'left', 'no-member'])(
    'returns null for an ineligible %s selection',
    async (state) => {
      if (state === 'missing') repositoryMock.workspace.mockResolvedValue(null);
      if (state === 'archived' || state === 'deleted')
        repositoryMock.workspace.mockResolvedValue({
          id: 'w',
          archivedAt: state === 'archived' ? new Date() : null,
          deletedAt: state === 'deleted' ? new Date() : null,
        });
      if (state === 'suspended' || state === 'left')
        repositoryMock.membership.mockResolvedValue({
          ...actor,
          state: state.toUpperCase(),
        });
      if (state === 'no-member')
        repositoryMock.membership.mockResolvedValue(null);
      await expect(service.active('actor')).resolves.toBeNull();
    },
  );
  it('creates an owner membership and selects the new workspace', async () => {
    const workspace = { id: 'created', name: 'Circle', slug: 'circle' };
    repositoryMock.create.mockResolvedValue(workspace);
    await expect(
      service.create(identity, { name: ' Circle ', slug: 'circle' }),
    ).resolves.toEqual(workspace);
    expect(repositoryMock.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ name: 'Circle', slug: 'circle' }),
      expect.objectContaining({
        userId: identity.userId,
        role: 'OWNER',
        state: 'ACTIVE',
      }),
    );
    expect(repositoryMock.select).toHaveBeenCalledWith(
      tx,
      identity.userId,
      expect.any(String),
    );
  });
  it('maps a nested duplicate workspace slug to an actionable conflict', async () => {
    repositoryMock.create.mockRejectedValue({
      cause: { code: '23505', constraint: 'workspaces_slug_idx' },
    });
    await expect(
      service.create(identity, { name: 'Circle', slug: 'circle' }),
    ).rejects.toThrow(
      'This workspace slug is already taken. Choose a different slug.',
    );
    expect(repositoryMock.select).not.toHaveBeenCalled();
  });
  it('preserves unrelated database errors', async () => {
    const error = { cause: { code: '23505', constraint: 'other_idx' } };
    repositoryMock.create.mockRejectedValue(error);
    await expect(
      service.create(identity, { name: 'Circle', slug: 'circle' }),
    ).rejects.toBe(error);
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
