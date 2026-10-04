/* Transaction doubles keep the security predicates testable without external I/O. */
/* eslint-disable @typescript-eslint/require-await */
import { UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service';
import {
  authTokens,
  refreshSessions,
  users,
} from '../../../../database/schema/auth.schema';
import type { AuthUser, Session } from '../application/authentication.types';
import { AuthMailOutbox } from './auth-mail-outbox';
import { PostgresAuthRepository } from './postgres-auth.repository';

describe('Postgres authentication verification boundary', () => {
  const user: AuthUser = {
    id: 'user',
    email: 'user@example.com',
    fullName: 'User',
    avatarUrl: null,
    passwordHash: 'hash',
    emailVerifiedAt: null,
    disabledAt: null,
  };
  const session: Session = {
    id: 'session',
    userId: user.id,
    familyId: 'family',
    tokenHash: 'refresh-hash',
    expiresAt: new Date(Date.now() + 60000),
    revokedAt: null,
  };
  let rows: unknown[][];
  let insert: jest.Mock;
  let update: jest.Mock;
  let enqueue: jest.Mock;
  let repository: PostgresAuthRepository;
  beforeEach(() => {
    rows = [];
    insert = jest
      .fn()
      .mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) });
    update = jest.fn();
    enqueue = jest.fn().mockResolvedValue(undefined);
    const tx = {
      insert,
      update,
      select: () => ({
        from: () => ({
          where: () => {
            const result = rows.shift() ?? [];
            return {
              for: async () => result,
              then: (resolve: (value: unknown[]) => unknown) =>
                Promise.resolve(result).then(resolve),
            };
          },
        }),
      }),
    };
    const database = {
      db: {
        transaction: (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      },
    };
    repository = new PostgresAuthRepository(
      database as unknown as DatabaseService,
      { enqueue } as unknown as AuthMailOutbox,
    );
  });
  it('atomically creates an unverified account and verification mail without a session', async () => {
    await repository.createUser(user, {
      hash: 'verification-hash',
      expiresAt: new Date(),
      message: { to: user.email, subject: 'Verify', text: 'link' },
    });
    expect(insert.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      users,
      authTokens,
    ]);
    expect(insert).not.toHaveBeenCalledWith(refreshSessions);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
  it('locks and rejects an unverified account before inserting a password session', async () => {
    rows = [[user]];
    await expect(
      repository.createSession(session, user.passwordHash),
    ).rejects.toThrow(UnauthorizedException);
    expect(insert).not.toHaveBeenCalled();
  });
  it('rejects a legacy unverified refresh session without rotating or inserting a replacement', async () => {
    rows = [[session], [user], [session]];
    expect(
      await repository.rotate(session.tokenHash, { ...session, id: 'next' }),
    ).toBe('invalid');
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
  it('creates a password session when the locked account is verified', async () => {
    rows = [[{ ...user, emailVerifiedAt: new Date() }]];
    await repository.createSession(session, user.passwordHash);
    expect(insert).toHaveBeenCalledWith(refreshSessions);
  });
  it('verifies magic-link mailbox proof before inserting its session in the same transaction', async () => {
    const account = { ...user };
    const token = { id: 'token', userId: user.id };
    rows = [[token], [account]];
    update.mockImplementation((table: unknown) => ({
      set: jest.fn().mockImplementation((value: unknown) => ({
        where: jest
          .fn()
          .mockImplementation(() =>
            table === authTokens
              ? { returning: async () => [token] }
              : Promise.resolve(value),
          ),
      })),
    }));
    const result = await repository.consumeToken(
      'proof-hash',
      'magic-link',
      undefined,
      session,
    );
    expect(result?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(update.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      authTokens,
      users,
    ]);
    expect(update.mock.invocationCallOrder[1]).toBeLessThan(
      insert.mock.invocationCallOrder[0]!,
    );
    expect(insert).toHaveBeenCalledWith(refreshSessions);
  });
});
