import { Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { ResourceConflictException } from '../../../common/exceptions/resource-conflict.exception';
import type { AuthUser } from '../domain/auth-user';
import {
  AUTH_REPOSITORY,
  type AuthRepository,
  type ReplacementRefreshSessionInput,
} from './ports/auth-repository.port';
import {
  MAGIC_LINK_SENDER,
  type MagicLinkSender,
} from './ports/magic-link-sender.port';
import { AuthenticationException } from './authentication.exception';
import { PasswordHasher } from './password-hasher.service';
import { TokenService } from './token.service';

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  private dummyPasswordHash: string | undefined;

  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly repository: AuthRepository,
    @Inject(MAGIC_LINK_SENDER)
    private readonly magicLinkSender: MagicLinkSender,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
  ) {}

  async signUp(input: SignUpInput): Promise<AuthSession> {
    const existing = await this.repository.findUserByEmail(input.email);
    if (existing !== null) {
      throw new ResourceConflictException(
        'An account with this email address already exists.',
        { field: 'email' },
      );
    }

    const now = new Date();
    const user = await this.repository.createUser({
      id: `usr_${ulid()}`,
      email: input.email,
      passwordHash: await this.passwordHasher.hash(input.password),
      fullName: input.fullName,
      createdAt: now,
    });
    return this.issueSession(user, now);
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const user = await this.repository.findUserByEmail(input.email);
    const passwordHash =
      user?.passwordHash ?? (await this.getDummyPasswordHash());
    const valid = await this.passwordHasher.verify(
      input.password,
      passwordHash,
    );

    if (!valid || user === null || user.passwordHash === null) {
      throw new AuthenticationException();
    }
    return this.issueSession(user, new Date());
  }

  async requestMagicLink(email: string): Promise<void> {
    const user = await this.repository.findUserByEmail(email);
    if (user === null) {
      return;
    }

    const now = new Date();
    const token = this.tokenService.createMagicLinkToken();
    const expiresAt = this.tokenService.getMagicLinkExpiration(now);
    await this.repository.createMagicLinkToken({
      id: `mtk_${ulid()}`,
      userId: user.id,
      tokenHash: token.hash,
      expiresAt,
      createdAt: now,
    });
    await this.magicLinkSender.send({
      email: user.email,
      fullName: user.fullName,
      token: token.raw,
      expiresAt,
    });
  }

  async verifyMagicLink(token: string): Promise<AuthSession> {
    const now = new Date();
    const user = await this.repository.consumeMagicLinkToken(
      this.tokenService.hashOpaqueToken(token),
      now,
    );
    if (user === null) {
      throw new AuthenticationException(
        'The magic link is invalid, expired, or has already been used.',
      );
    }
    return this.issueSession(user, now);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const now = new Date();
    const replacementToken = this.tokenService.createRefreshToken();
    const replacement: ReplacementRefreshSessionInput = {
      id: `ses_${ulid()}`,
      tokenHash: replacementToken.hash,
      expiresAt: this.tokenService.getRefreshExpiration(now),
      createdAt: now,
    };
    const user = await this.repository.rotateRefreshSession(
      this.tokenService.hashOpaqueToken(refreshToken),
      replacement,
      now,
    );
    if (user === null) {
      throw new AuthenticationException(
        'The refresh token is invalid, expired, or has been revoked.',
      );
    }

    const access = await this.tokenService.createAccessToken(user);
    return {
      user,
      accessToken: access.value,
      refreshToken: replacementToken.raw,
      expiresIn: access.expiresIn,
    };
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.repository.revokeRefreshSession(
      this.tokenService.hashOpaqueToken(refreshToken),
      userId,
      new Date(),
    );
  }

  private async issueSession(user: AuthUser, now: Date): Promise<AuthSession> {
    const refreshToken = this.tokenService.createRefreshToken();
    await this.repository.createRefreshSession({
      id: `ses_${ulid()}`,
      userId: user.id,
      tokenHash: refreshToken.hash,
      expiresAt: this.tokenService.getRefreshExpiration(now),
      createdAt: now,
    });
    const access = await this.tokenService.createAccessToken(user);
    return {
      user,
      accessToken: access.value,
      refreshToken: refreshToken.raw,
      expiresIn: access.expiresIn,
    };
  }

  private async getDummyPasswordHash(): Promise<string> {
    this.dummyPasswordHash ??= await this.passwordHasher.hash(
      'not-a-real-account-password',
    );
    return this.dummyPasswordHash;
  }
}
