export interface OAuthTokenBundle {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scopes: string[];
  expiresAt: string;
}

export const isOAuthTokenBundle = (
  value: unknown,
): value is OAuthTokenBundle => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.accessToken === 'string' &&
    (typeof record.refreshToken === 'string' || record.refreshToken === null) &&
    typeof record.tokenType === 'string' &&
    Array.isArray(record.scopes) &&
    record.scopes.every((scope) => typeof scope === 'string') &&
    typeof record.expiresAt === 'string'
  );
};
