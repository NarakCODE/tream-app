export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string | null;
  fullName: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AuthenticatedUser = Omit<AuthUser, 'passwordHash'>;

export const toAuthenticatedUser = (user: AuthUser): AuthenticatedUser => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  avatarUrl: user.avatarUrl,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});
