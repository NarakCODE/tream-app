import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { DatabaseTransaction } from '../../database/transaction';
import { OnboardingService } from './onboarding.service';
import { DatabaseService } from '../../database/database.service';
import { WorkspaceRepository } from '../iam/workspaces/application/ports/workspace.repository';
import { WorkspaceAuthorizationService } from '../iam/workspaces/application/workspace-authorization.service';
import { CommandBus } from '../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput } from '../../common/idempotency/idempotency.types';

describe('OnboardingService', () => {
  const tx = {};
  const now = new Date('2026-10-07T00:00:00Z');
  let user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: null;
    emailVerifiedAt: Date | null;
    disabledAt: Date | null;
  };
  let member: {
    id: string;
    state: string;
    role: string;
    onboardingCompletedAt: Date | null;
  };
  let repository: {
    user: jest.Mock;
    hasWorkspace: jest.Mock;
    hasTeam: jest.Mock;
    complete: jest.Mock;
    lockSelection: jest.Mock;
  };
  let workspaces: {
    selection: jest.Mock;
    workspace: jest.Mock;
    membership: jest.Mock;
  };
  let authorization: { require: jest.Mock };
  let service: OnboardingService;
  const identity = { userId: 'u' } as IdempotencyReservationInput;
  beforeEach(() => {
    user = {
      id: 'u',
      email: 'u@example.test',
      fullName: 'User',
      avatarUrl: null,
      emailVerifiedAt: now,
      disabledAt: null,
    };
    member = {
      id: 'm',
      state: 'ACTIVE',
      role: 'OWNER',
      onboardingCompletedAt: null,
    };
    repository = {
      user: jest.fn(() => user),
      hasWorkspace: jest.fn(() => false),
      hasTeam: jest.fn(() => false),
      lockSelection: jest.fn(
        () => workspaces.selection() as string | undefined,
      ),
      complete: jest.fn(() => {
        member.onboardingCompletedAt ??= now;
      }),
    };
    workspaces = {
      selection: jest.fn(() => 'w'),
      workspace: jest.fn(() => ({
        id: 'w',
        deletedAt: null,
        archivedAt: null,
      })),
      membership: jest.fn(() => member),
    };
    authorization = { require: jest.fn(() => ({ member })) };
    const commands = {
      execute: jest.fn(
        async (
          _identity: IdempotencyReservationInput,
          handler: (tx: DatabaseTransaction) => Promise<unknown>,
          options: { authorize: (tx: DatabaseTransaction) => Promise<void> },
        ) => {
          await options.authorize(tx as DatabaseTransaction);
          return handler(tx as DatabaseTransaction);
        },
      ),
    };
    service = new OnboardingService(
      {
        db: { transaction: (fn: (value: object) => unknown) => fn(tx) },
      } as unknown as DatabaseService,
      repository,
      workspaces as unknown as WorkspaceRepository,
      authorization as unknown as WorkspaceAuthorizationService,
      commands as unknown as CommandBus,
    );
  });
  it.each([
    ['OWNER', 'CREATE_TEAM'],
    ['ADMIN', 'CREATE_TEAM'],
    ['MEMBER', 'WAIT_FOR_TEAM'],
    ['GUEST', 'WAIT_FOR_TEAM'],
  ])('handles missing live teams for %s', async (role, nextStep) => {
    member.role = role;
    expect((await service.bootstrap('u')).onboarding).toEqual({
      setupReady: false,
      completed: false,
      completedAt: null,
      nextStep,
    });
  });
  it('prioritizes verification and excludes credentials', async () => {
    user.emailVerifiedAt = null;
    const result = await service.bootstrap('u');
    expect(result.onboarding.nextStep).toBe('VERIFY_EMAIL');
    expect(result.user).toEqual({
      id: 'u',
      email: user.email,
      fullName: 'User',
      avatarUrl: null,
      emailVerified: false,
    });
  });
  it('rejects disabled users', async () => {
    user.disabledAt = now;
    await expect(service.bootstrap('u')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it.each([false, true])(
    'uses available membership existence with no selection (%s)',
    async (hasWorkspace) => {
      workspaces.selection.mockReturnValue(undefined);
      repository.hasWorkspace.mockReturnValue(hasWorkspace);
      const result = await service.bootstrap('u');
      expect(result.activeWorkspace).toBeNull();
      expect(result.onboarding.nextStep).toBe(
        hasWorkspace ? 'SELECT_WORKSPACE' : 'CREATE_WORKSPACE',
      );
    },
  );
  it('ignores suspended memberships and unusable workspaces', async () => {
    member.state = 'SUSPENDED';
    repository.hasWorkspace.mockReturnValue(true);
    expect((await service.bootstrap('u')).onboarding.nextStep).toBe(
      'SELECT_WORKSPACE',
    );
    member.state = 'ACTIVE';
    workspaces.workspace.mockReturnValue({
      id: 'w',
      archivedAt: now,
      deletedAt: null,
    });
    expect((await service.bootstrap('u')).activeWorkspace).toBeNull();
  });
  it('allows a guest with workspace-wide live teams without returning team details', async () => {
    member.role = 'GUEST';
    repository.hasTeam.mockReturnValue(true);
    const result = await service.bootstrap('u');
    expect(result.onboarding.nextStep).toBe('INVITE_TEAMMATES');
    expect(result).not.toHaveProperty('teams');
  });
  it('requires readiness even when completion was recorded', async () => {
    member.onboardingCompletedAt = now;
    expect((await service.bootstrap('u')).onboarding.completed).toBe(false);
    repository.hasTeam.mockReturnValue(true);
    expect((await service.bootstrap('u')).onboarding.nextStep).toBe('DONE');
  });
  it('completes only the current membership and preserves its first timestamp', async () => {
    repository.hasTeam.mockReturnValue(true);
    const first = await service.complete(identity, 'w');
    expect(first.onboarding.completedAt).toBe(now.toISOString());
    await service.complete(identity, 'w');
    expect(repository.complete).toHaveBeenCalledWith(tx, 'm');
    expect(member.onboardingCompletedAt).toBe(now);
    expect(authorization.require).toHaveBeenCalledWith(
      tx,
      'u',
      'w',
      'workspace.read',
      { lock: true },
    );
  });
  it('reauthorizes every command before invoking its write', async () => {
    repository.hasTeam.mockReturnValue(true);
    await service.complete(identity, 'w');
    authorization.require.mockRejectedValue(new ForbiddenException());
    await expect(service.complete(identity, 'w')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repository.complete).toHaveBeenCalledTimes(1);
  });
  it.each(['unverified', 'wrong-selection', 'no-team'])(
    'rejects invalid completion: %s',
    async (condition) => {
      repository.hasTeam.mockReturnValue(true);
      if (condition === 'unverified') user.emailVerifiedAt = null;
      if (condition === 'wrong-selection')
        workspaces.selection.mockReturnValue('other');
      if (condition === 'no-team') repository.hasTeam.mockReturnValue(false);
      await expect(service.complete(identity, 'w')).rejects.toBeInstanceOf(
        condition === 'unverified' ? ForbiddenException : ConflictException,
      );
      expect(repository.complete).not.toHaveBeenCalled();
    },
  );
});
