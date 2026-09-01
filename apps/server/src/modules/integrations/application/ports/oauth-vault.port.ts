import type { OAuthTokenBundle } from '../../domain/oauth-token';

export const OAUTH_VAULT = Symbol('OAUTH_VAULT');

export interface OAuthVault {
  encryptTokens(workspaceId: string, tokens: OAuthTokenBundle): string;
  decryptTokens(workspaceId: string, encrypted: string): OAuthTokenBundle;
  encryptSecret(workspaceId: string, secret: string): string;
  decryptSecret(workspaceId: string, encrypted: string): string;
}
