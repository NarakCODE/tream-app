export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  disabledAt: Date | null;
}
export interface Session {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}
export type TokenKind = 'verify-email' | 'password-reset' | 'magic-link';
export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');
export interface AuthRepository {
  findByEmail(email: string): Promise<AuthUser | undefined>;
  findUser(id: string): Promise<AuthUser | undefined>;
  createUser(
    user: AuthUser,
    verification: {
      hash: string;
      expiresAt: Date;
      message: { to: string; subject: string; text: string };
    },
  ): Promise<void>;
  updateProfile(id: string, fullName: string): Promise<AuthUser>;
  createSession(
    session: Session,
    expectedPasswordHash: string | null,
  ): Promise<void>;
  findSession(id: string): Promise<Session | undefined>;
  rotate(hash: string, next: Session): Promise<'ok' | 'invalid' | 'reused'>;
  revoke(userId: string, sessionId?: string): Promise<void>;
  sessions(userId: string): Promise<Session[]>;
  issueToken(
    userId: string,
    kind: TokenKind,
    hash: string,
    expiresAt: Date,
    message?: { to: string; subject: string; text: string },
  ): Promise<void>;
  consumeToken(
    hash: string,
    kind: TokenKind,
    passwordHash?: string,
    session?: Session,
  ): Promise<AuthUser | undefined>;
  throttle(key: string, limit: number): Promise<boolean>;
}
