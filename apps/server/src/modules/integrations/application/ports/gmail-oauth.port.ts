import type { OAuthTokenBundle } from '../../domain/oauth-token';

export const GMAIL_OAUTH = Symbol('GMAIL_OAUTH');

export interface GmailAuthorizationInput {
  state: string;
  codeChallenge: string;
}

export interface GmailCodeExchangeInput {
  code: string;
  codeVerifier: string;
}

export interface GmailAccountProfile {
  email: string;
}

export interface GmailOAuthPort {
  createAuthorizationUrl(input: GmailAuthorizationInput): string;
  exchangeCode(input: GmailCodeExchangeInput): Promise<OAuthTokenBundle>;
  refresh(refreshToken: string): Promise<OAuthTokenBundle>;
  revoke(token: string): Promise<void>;
  getProfile(accessToken: string): Promise<GmailAccountProfile>;
}
