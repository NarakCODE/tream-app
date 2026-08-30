import type { AuthUser } from '../../domain/auth-user';

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');

export interface CreateAuthUserInput {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  createdAt: Date;
}

export interface UpdateAuthUserInput {
  fullName?: string;
  avatarUrl?: string | null;
  updatedAt: Date;
}

export interface RefreshSessionInput {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export type ReplacementRefreshSessionInput = Omit<
  RefreshSessionInput,
  'userId'
>;

export interface MagicLinkTokenInput {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserById(userId: string): Promise<AuthUser | null>;
  createUser(input: CreateAuthUserInput): Promise<AuthUser>;
  updateUser(
    userId: string,
    input: UpdateAuthUserInput,
  ): Promise<AuthUser | null>;
  createRefreshSession(input: RefreshSessionInput): Promise<void>;
  rotateRefreshSession(
    tokenHash: string,
    replacement: ReplacementRefreshSessionInput,
    revokedAt: Date,
  ): Promise<AuthUser | null>;
  revokeRefreshSession(
    tokenHash: string,
    userId: string,
    revokedAt: Date,
  ): Promise<void>;
  createMagicLinkToken(input: MagicLinkTokenInput): Promise<void>;
  consumeMagicLinkToken(
    tokenHash: string,
    consumedAt: Date,
  ): Promise<AuthUser | null>;
}
