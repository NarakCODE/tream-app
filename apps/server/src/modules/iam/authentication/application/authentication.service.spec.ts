/* In-memory test ports intentionally return resolved promises without external I/O. */
/* eslint-disable @typescript-eslint/require-await */
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthenticationService, tokenHash } from './authentication.service';
import type { AuthRepository, AuthUser, Session } from './authentication.types';
import { hashPassword, verifyPassword } from './password';
import { appConfig } from '../../../../config/app.config';
import type { ApplicationConfiguration } from '../../../../config/configuration.interface';

describe('AuthenticationService security', () => {
  let auth: AuthenticationService;
  let user: AuthUser;
  let sessions: Map<string, Session>;
  let repo: AuthRepository;
  let config: ConfigService<ApplicationConfiguration, true>;
  beforeEach(async () => {
    user = {
      id: 'user1',
      email: 'user@example.com',
      fullName: 'User',
      avatarUrl: null,
      passwordHash: await hashPassword('long-password-123'),
      emailVerifiedAt: new Date(),
      disabledAt: null,
    };
    sessions = new Map();
    repo = {
      findByEmail: async (email) => (email === user.email ? user : undefined),
      findUser: async (id) => (id === user.id ? user : undefined),
      createUser: async (value) => {
        user = value;
      },
      updateProfile: async (_id, fullName) => ({ ...user, fullName }),
      createSession: async (session) => {
        sessions.set(session.id, session);
      },
      findSession: async (id) => sessions.get(id),
      rotate: async (hash, next) => {
        const current = [...sessions.values()].find(
          (s) => s.tokenHash === hash,
        );
        if (!current || !user.emailVerifiedAt) return 'invalid';
        if (current.revokedAt) {
          for (const session of sessions.values())
            if (session.familyId === current.familyId)
              session.revokedAt = new Date();
          return 'reused';
        }
        current.revokedAt = new Date();
        sessions.set(next.id, {
          ...next,
          userId: current.userId,
          familyId: current.familyId,
        });
        return 'ok';
      },
      revoke: async (id, sessionId) => {
        for (const session of sessions.values())
          if (session.userId === id && (!sessionId || session.id === sessionId))
            session.revokedAt = new Date();
      },
      sessions: async () => [...sessions.values()],
      issueToken: async () => {},
      consumeToken: async () => undefined,
      throttle: async () => true,
    };
    config = new ConfigService<ApplicationConfiguration, true>(appConfig());
    auth = new AuthenticationService(repo, config, new JwtService());
  });
  it('hashes using salted scrypt and verifies without plaintext storage', async () => {
    const first = await hashPassword('long-password-123');
    const second = await hashPassword('long-password-123');
    expect(first).not.toEqual(second);
    expect(await verifyPassword('long-password-123', first)).toBe(true);
    expect(await verifyPassword('bad', first)).toBe(false);
    expect(await verifyPassword('bad', 'malformed')).toBe(false);
  });
  it('normalizes login and returns safe DTOs with only hashed refresh secrets persisted', async () => {
    const result = await auth.login('USER@EXAMPLE.COM', 'long-password-123');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect([...sessions.values()][0]?.tokenHash).toBe(
      tokenHash(result.refreshToken),
    );
    expect(await auth.authenticate(result.accessToken)).toMatchObject({
      id: user.id,
      email: user.email,
    });
  });
  it('queues verification mail but denies authentication and creates no session for an unverified login', async () => {
    user.emailVerifiedAt = null;
    const issueToken = jest.spyOn(repo, 'issueToken');
    const createSession = jest.spyOn(repo, 'createSession');
    await expect(
      auth.login('USER@EXAMPLE.COM', 'long-password-123'),
    ).rejects.toMatchObject({
      status: 403,
      code: 'EMAIL_NOT_VERIFIED',
    });
    expect(createSession).not.toHaveBeenCalled();
    expect(sessions.size).toBe(0);

    expect(issueToken).toHaveBeenCalledTimes(1);
    const [userId, kind, hash, expiresAt, message] = issueToken.mock.calls[0]!;
    expect(userId).toBe(user.id);
    expect(kind).toBe('verify-email');
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(message).toBeDefined();
    expect(message!.to).toBe(user.email);
    const link = new URL(
      message!.text.replace('Use this single-use link: ', ''),
    );
    expect(link.pathname).toBe('/auth/verify-email');
    expect(hash).toBe(tokenHash(link.searchParams.get('token')!));
  });
  it('does not queue verification mail for verified users or unsuccessful logins', async () => {
    const issueToken = jest.spyOn(repo, 'issueToken');
    user.emailVerifiedAt = new Date();
    await auth.login(user.email, 'long-password-123');
    user.emailVerifiedAt = null;
    await expect(auth.login(user.email, 'wrong-password')).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(
      auth.login('unknown@example.com', 'long-password-123'),
    ).rejects.toThrow(UnauthorizedException);
    user.disabledAt = new Date();
    await expect(auth.login(user.email, 'long-password-123')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(issueToken).not.toHaveBeenCalled();
  });
  it('keeps signup verification in the atomic user creation without a second email', async () => {
    const createUser = jest.spyOn(repo, 'createUser');
    const issueToken = jest.spyOn(repo, 'issueToken');
    const result = await auth.signup(
      'NEW@EXAMPLE.COM',
      'long-password-123',
      'New User',
    );
    expect(result).toEqual({
      message: 'Account created. Verify your email before signing in.',
    });
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('refreshToken');
    expect(sessions.size).toBe(0);
    expect(user.emailVerifiedAt).toBeNull();
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(createUser.mock.calls[0]![1].message.to).toBe('new@example.com');
    expect(issueToken).not.toHaveBeenCalled();
  });
  it('refresh replay revokes the entire family and immediately invalidates access', async () => {
    const first = await auth.login(user.email, 'long-password-123');
    const second = await auth.refresh(first.refreshToken);
    await expect(auth.authenticate(first.accessToken)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(await auth.authenticate(second.accessToken)).toMatchObject({
      id: user.id,
    });
    await expect(auth.refresh(first.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(auth.authenticate(second.accessToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });
  it('rejects disabled users, revoked sessions, wrong audience and malformed tokens', async () => {
    const result = await auth.login(user.email, 'long-password-123');
    const session = [...sessions.values()][0]!;
    const wrong = await new JwtService().signAsync(
      { sub: user.id, sid: session.id },
      {
        secret: config.getOrThrow('auth.jwt.accessSecret', { infer: true }),
        issuer: config.getOrThrow('auth.jwt.issuer', { infer: true }),
        audience: 'wrong',
        algorithm: 'HS256',
      },
    );
    await expect(auth.authenticate(wrong)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(auth.authenticate('garbage')).rejects.toThrow(
      UnauthorizedException,
    );
    user.disabledAt = new Date();
    await expect(auth.authenticate(result.accessToken)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(auth.login(user.email, 'long-password-123')).rejects.toThrow(
      UnauthorizedException,
    );
  });
  it('rejects existing access and refresh sessions if the account is unverified', async () => {
    const result = await auth.login(user.email, 'long-password-123');
    user.emailVerifiedAt = null;
    await expect(auth.authenticate(result.accessToken)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(auth.refresh(result.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(sessions.size).toBe(1);
  });
  it('issues a session only after a magic link atomically verifies the account', async () => {
    user.emailVerifiedAt = null;
    repo.consumeToken = jest
      .fn()
      .mockImplementation(async (_hash, _kind, _password, session: Session) => {
        user.emailVerifiedAt = new Date();
        sessions.set(session.id, { ...session, userId: user.id });
        return user;
      });
    const result = await auth.consumeToken('mailbox-proof', 'magic-link');
    expect(result).toHaveProperty('user.emailVerified', true);
    expect(result).toHaveProperty('accessToken');
  });
  it('does not issue tokens if a magic-link repository returns an unverified account', async () => {
    user.emailVerifiedAt = null;
    repo.consumeToken = jest.fn().mockResolvedValue(user);
    await expect(
      auth.consumeToken('mailbox-proof', 'magic-link'),
    ).rejects.toThrow(UnauthorizedException);
  });
  it('revokes all sessions and rejects unknown single-use token', async () => {
    const result = await auth.login(user.email, 'long-password-123');
    await auth.revoke(user.id);
    await expect(auth.authenticate(result.accessToken)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(
      auth.consumeToken('unknown', 'password-reset', 'new-long-password'),
    ).rejects.toThrow(UnauthorizedException);
  });
  it('shares throttling through a persistence port', async () => {
    repo.throttle = jest.fn().mockResolvedValue(false);
    await expect(
      auth.throttle('login', '127.0.0.1', user.email),
    ).rejects.toMatchObject({ status: 429 });
  });
});
