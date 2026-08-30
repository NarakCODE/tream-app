import { ResourceConflictException } from '../../src/common/exceptions/resource-conflict.exception';
import type {
  AuthRepository,
  CreateAuthUserInput,
  MagicLinkTokenInput,
  RefreshSessionInput,
  ReplacementRefreshSessionInput,
  UpdateAuthUserInput,
} from '../../src/modules/iam/application/ports/auth-repository.port';
import type { AuthUser } from '../../src/modules/iam/domain/auth-user';

interface StoredRefreshSession extends RefreshSessionInput {
  revokedAt: Date | null;
}

interface StoredMagicLinkToken extends MagicLinkTokenInput {
  consumedAt: Date | null;
}

export class InMemoryAuthRepository implements AuthRepository {
  private readonly users = new Map<string, AuthUser>();
  private readonly refreshSessions = new Map<string, StoredRefreshSession>();
  private readonly magicLinks = new Map<string, StoredMagicLinkToken>();

  reset(): void {
    this.users.clear();
    this.refreshSessions.clear();
    this.magicLinks.clear();
  }

  expireMagicLink(tokenHash: string): void {
    const token = this.magicLinks.get(tokenHash);
    if (token !== undefined) {
      token.expiresAt = new Date(0);
    }
  }

  peekUser(userId: string): AuthUser | null {
    return this.users.get(userId) ?? null;
  }

  findUserByEmail(email: string): Promise<AuthUser | null> {
    return Promise.resolve(
      [...this.users.values()].find((user) => user.email === email) ?? null,
    );
  }

  findUserById(userId: string): Promise<AuthUser | null> {
    return Promise.resolve(this.users.get(userId) ?? null);
  }

  createUser(input: CreateAuthUserInput): Promise<AuthUser> {
    if ([...this.users.values()].some((user) => user.email === input.email)) {
      throw new ResourceConflictException(
        'An account with this email address already exists.',
      );
    }
    const user: AuthUser = {
      ...input,
      avatarUrl: null,
      updatedAt: input.createdAt,
    };
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }

  updateUser(
    userId: string,
    input: UpdateAuthUserInput,
  ): Promise<AuthUser | null> {
    const user = this.users.get(userId);
    if (user === undefined) {
      return Promise.resolve(null);
    }
    const updated: AuthUser = {
      ...user,
      ...input,
    };
    this.users.set(userId, updated);
    return Promise.resolve(updated);
  }

  createRefreshSession(input: RefreshSessionInput): Promise<void> {
    this.refreshSessions.set(input.tokenHash, { ...input, revokedAt: null });
    return Promise.resolve();
  }

  rotateRefreshSession(
    tokenHash: string,
    replacement: ReplacementRefreshSessionInput,
    revokedAt: Date,
  ): Promise<AuthUser | null> {
    const session = this.refreshSessions.get(tokenHash);
    if (
      session === undefined ||
      session.revokedAt !== null ||
      session.expiresAt <= revokedAt
    ) {
      return Promise.resolve(null);
    }
    session.revokedAt = revokedAt;
    this.refreshSessions.set(replacement.tokenHash, {
      ...replacement,
      userId: session.userId,
      revokedAt: null,
    });
    return this.findUserById(session.userId);
  }

  revokeRefreshSession(
    tokenHash: string,
    userId: string,
    revokedAt: Date,
  ): Promise<void> {
    const session = this.refreshSessions.get(tokenHash);
    if (session?.userId === userId && session.revokedAt === null) {
      session.revokedAt = revokedAt;
    }
    return Promise.resolve();
  }

  createMagicLinkToken(input: MagicLinkTokenInput): Promise<void> {
    for (const token of this.magicLinks.values()) {
      if (token.userId === input.userId && token.consumedAt === null) {
        token.consumedAt = input.createdAt;
      }
    }
    this.magicLinks.set(input.tokenHash, { ...input, consumedAt: null });
    return Promise.resolve();
  }

  consumeMagicLinkToken(
    tokenHash: string,
    consumedAt: Date,
  ): Promise<AuthUser | null> {
    const token = this.magicLinks.get(tokenHash);
    if (
      token === undefined ||
      token.consumedAt !== null ||
      token.expiresAt <= consumedAt
    ) {
      return Promise.resolve(null);
    }
    token.consumedAt = consumedAt;
    return this.findUserById(token.userId);
  }
}
