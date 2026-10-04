import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { ApplicationConfiguration } from '../../../../config/configuration.interface';
import {
  AUTH_REPOSITORY,
  type AuthRepository,
  type AuthUser,
  type Session,
  type TokenKind,
} from './authentication.types';
import { hashPassword, verifyPassword } from './password';
import { AppException } from '../../../../common/exceptions/app.exception';
import { AppErrorCode } from '../../../../common/enums/app-error-code.enum';
export const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const publicUser = (user: AuthUser) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  avatarUrl: user.avatarUrl,
  emailVerified: user.emailVerifiedAt !== null,
});
export function duration(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
  if (!match) throw new Error('Invalid authentication duration');
  return (
    Number(match[1]) *
    ({ ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]!] ?? 0)
  );
}
@Injectable()
export class AuthenticationService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
    private readonly config: ConfigService<ApplicationConfiguration, true>,
    private readonly jwt: JwtService,
  ) {}
  async throttle(operation: string, ip: string, email?: string) {
    for (const key of [
      `${operation}:ip:${tokenHash(ip)}`,
      ...(email
        ? [`${operation}:email:${tokenHash(email.trim().toLowerCase())}`]
        : []),
    ]) {
      if (
        !(await this.repository.throttle(key, operation === 'login' ? 10 : 5))
      )
        throw new HttpException('Too many authentication attempts', 429);
    }
  }
  async signup(email: string, password: string, fullName: string) {
    const normalized = email.trim().toLowerCase();
    const user: AuthUser = {
      id: randomUUID(),
      email: normalized,
      fullName,
      avatarUrl: null,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: null,
      disabledAt: null,
    };
    const token = randomBytes(32).toString('base64url');
    const url = new URL(
      '/auth/verify-email',
      this.config.getOrThrow('auth.magicLink.baseUrl', { infer: true }),
    );
    url.searchParams.set('token', token);
    try {
      await this.repository.createUser(user, {
        hash: tokenHash(token),
        expiresAt: new Date(
          Date.now() +
            duration(
              this.config.getOrThrow('auth.magicLink.ttl', { infer: true }),
            ),
        ),
        message: {
          to: user.email,
          subject: 'Tream verify-email',
          text: `Use this single-use link: ${url.toString()}`,
        },
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (('code' in error && error.code === '23505') ||
          ('cause' in error &&
            typeof error.cause === 'object' &&
            error.cause !== null &&
            'code' in error.cause &&
            error.cause.code === '23505'))
      )
        throw new ConflictException('Email is already registered');
      throw error;
    }
    return { message: 'Account created. Verify your email before signing in.' };
  }
  async login(email: string, password: string) {
    const user = await this.repository.findByEmail(email.trim().toLowerCase());
    // Derive even for nonexistent accounts to avoid the obvious email timing oracle.
    const valid = await verifyPassword(
      password,
      user?.passwordHash ??
        `scrypt:32768:8:3:${'0'.repeat(32)}:${'0'.repeat(128)}`,
    );
    if (!user || user.disabledAt || !valid)
      throw new UnauthorizedException('Invalid credentials');
    if (!user.emailVerifiedAt) {
      await this.requestToken(user.email, 'verify-email');
      throw new AppException(
        AppErrorCode.EmailNotVerified,
        'Verify your email before signing in.',
        HttpStatus.FORBIDDEN,
      );
    }
    return this.openSession(user);
  }
  private newSession(userId: string, familyId = randomUUID()) {
    const refreshToken = randomBytes(32).toString('base64url');
    const session: Session = {
      id: randomUUID(),
      userId,
      familyId,
      tokenHash: tokenHash(refreshToken),
      expiresAt: new Date(
        Date.now() +
          duration(
            this.config.getOrThrow('auth.jwt.refreshTtl', { infer: true }),
          ),
      ),
      revokedAt: null,
    };
    return { session, refreshToken };
  }
  private async result(user: AuthUser, session: Session, refreshToken: string) {
    if (!user.emailVerifiedAt || user.disabledAt)
      throw new UnauthorizedException('Verified account required');
    const ttl = Math.floor(
      duration(this.config.getOrThrow('auth.jwt.accessTtl', { infer: true })) /
        1000,
    );
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, sid: session.id },
      {
        secret: this.config.getOrThrow('auth.jwt.accessSecret', {
          infer: true,
        }),
        algorithm: 'HS256',
        issuer: this.config.getOrThrow('auth.jwt.issuer', { infer: true }),
        audience: this.config.getOrThrow('auth.jwt.audience', { infer: true }),
        expiresIn: ttl,
      },
    );
    return {
      user: publicUser(user),
      accessToken,
      refreshToken,
      expiresIn: ttl,
    };
  }
  private async openSession(user: AuthUser) {
    const { session, refreshToken } = this.newSession(user.id);
    await this.repository.createSession(session, user.passwordHash);
    return this.result(user, session, refreshToken);
  }
  async refresh(token: string) {
    const { session, refreshToken } = this.newSession('pending');
    const state = await this.repository.rotate(tokenHash(token), session);
    if (state !== 'ok')
      throw new UnauthorizedException('Invalid refresh session');
    const persisted = await this.repository.findSession(session.id);
    const user =
      persisted && (await this.repository.findUser(persisted.userId));
    if (!persisted || !user || user.disabledAt || !user.emailVerifiedAt)
      throw new UnauthorizedException();
    return this.result(user, persisted, refreshToken);
  }
  async authenticate(token: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; sid: string }>(
        token,
        {
          secret: this.config.getOrThrow('auth.jwt.accessSecret', {
            infer: true,
          }),
          algorithms: ['HS256'],
          issuer: this.config.getOrThrow('auth.jwt.issuer', { infer: true }),
          audience: this.config.getOrThrow('auth.jwt.audience', {
            infer: true,
          }),
        },
      );
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string')
        throw new UnauthorizedException();
      const session = await this.repository.findSession(payload.sid);
      const user = await this.repository.findUser(payload.sub);
      if (
        !session ||
        session.userId !== payload.sub ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        !user ||
        user.disabledAt ||
        !user.emailVerifiedAt
      )
        throw new UnauthorizedException();
      return { id: user.id, email: user.email, sessionId: session.id };
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }
  async profile(id: string) {
    const user = await this.repository.findUser(id);
    if (!user || user.disabledAt) throw new UnauthorizedException();
    return publicUser(user);
  }
  async updateProfile(id: string, fullName: string) {
    return publicUser(await this.repository.updateProfile(id, fullName));
  }
  revoke(id: string, sessionId?: string) {
    return this.repository.revoke(id, sessionId);
  }
  async sessions(id: string) {
    return (await this.repository.sessions(id)).map(({ id, expiresAt }) => ({
      id,
      expiresAt,
    }));
  }
  async requestToken(email: string, kind: TokenKind) {
    const user = await this.repository.findByEmail(email.trim().toLowerCase());
    if (user && !user.disabledAt) {
      const token = randomBytes(32).toString('base64url');
      const url = new URL(
        `/auth/${kind}`,
        this.config.getOrThrow('auth.magicLink.baseUrl', { infer: true }),
      );
      url.searchParams.set('token', token);
      await this.repository.issueToken(
        user.id,
        kind,
        tokenHash(token),
        new Date(
          Date.now() +
            duration(
              this.config.getOrThrow('auth.magicLink.ttl', { infer: true }),
            ),
        ),
        {
          to: user.email,
          subject: `Tream ${kind}`,
          text: `Use this single-use link: ${url.toString()}`,
        },
      );
    }
    return { message: 'If the account is eligible, an email will be sent.' };
  }
  async consumeToken(token: string, kind: TokenKind, password?: string) {
    const next = kind === 'magic-link' ? this.newSession('pending') : undefined;
    const user = await this.repository.consumeToken(
      tokenHash(token),
      kind,
      password ? await hashPassword(password) : undefined,
      next?.session,
    );
    if (!user) throw new UnauthorizedException('Invalid or expired token');
    return next
      ? this.result(
          user,
          { ...next.session, userId: user.id },
          next.refreshToken,
        )
      : { message: 'Token accepted' };
  }
}
