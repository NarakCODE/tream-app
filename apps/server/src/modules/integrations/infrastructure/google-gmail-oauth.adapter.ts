import { Inject, Injectable } from '@nestjs/common';
import type {
  GmailAccountProfile,
  GmailAuthorizationInput,
  GmailCodeExchangeInput,
  GmailOAuthPort,
} from '../application/ports/gmail-oauth.port';
import type { OAuthTokenBundle } from '../domain/oauth-token';
import {
  DEFAULT_GMAIL_SCOPES,
  GMAIL_INTEGRATION_CONFIG,
  type GmailIntegrationConfig,
} from '../integrations.config';
import { GoogleApiError } from './google-api.error';

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

@Injectable()
export class GoogleGmailOAuthAdapter implements GmailOAuthPort {
  constructor(
    @Inject(GMAIL_INTEGRATION_CONFIG)
    private readonly config: GmailIntegrationConfig,
  ) {}

  createAuthorizationUrl(input: GmailAuthorizationInput): string {
    this.assertConfigured();
    const url = new URL(
      '/o/oauth2/v2/auth',
      this.config.oauthBaseUrl ?? 'https://accounts.google.com',
    );
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: (this.config.scopes ?? [...DEFAULT_GMAIL_SCOPES]).join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }

  async exchangeCode(input: GmailCodeExchangeInput): Promise<OAuthTokenBundle> {
    return this.requestToken({
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: this.config.redirectUri,
    });
  }

  async refresh(refreshToken: string): Promise<OAuthTokenBundle> {
    return this.requestToken({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
  }

  async revoke(token: string): Promise<void> {
    this.assertConfigured();
    const url = new URL(
      '/o/oauth2/revoke',
      this.config.oauthBaseUrl ?? 'https://oauth2.googleapis.com',
    );
    url.searchParams.set('token', token);
    const response = await fetch(url, { method: 'POST' });
    if (!response.ok && response.status !== 400) {
      throw new GoogleApiError(
        'Google rejected the token revocation request.',
        response.status,
        await response.text(),
      );
    }
  }

  async getProfile(accessToken: string): Promise<GmailAccountProfile> {
    this.assertConfigured();
    const response = await fetch(
      `${this.apiBaseUrl()}/gmail/v1/users/me/profile`,
      { headers: this.authorizationHeaders(accessToken) },
    );
    if (!response.ok) {
      throw new GoogleApiError(
        'Google rejected the Gmail profile request.',
        response.status,
        await response.text(),
      );
    }
    const body = (await response.json()) as { emailAddress?: unknown };
    if (typeof body.emailAddress !== 'string') {
      throw new GoogleApiError(
        'Google returned an invalid Gmail profile.',
        response.status,
        JSON.stringify(body),
      );
    }
    return { email: body.emailAddress.trim().toLowerCase() };
  }

  private async requestToken(
    values: Record<string, string>,
  ): Promise<OAuthTokenBundle> {
    this.assertConfigured();
    const response = await fetch(
      new URL(
        '/token',
        this.config.oauthBaseUrl ?? 'https://oauth2.googleapis.com',
      ),
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          ...values,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
      },
    );
    const body = (await response.json()) as GoogleTokenResponse;
    if (
      !response.ok ||
      typeof body.access_token !== 'string' ||
      typeof body.expires_in !== 'number'
    ) {
      throw new GoogleApiError(
        body.error_description ?? body.error ?? 'Google OAuth request failed.',
        response.status,
        JSON.stringify(body),
      );
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      tokenType: body.token_type ?? 'Bearer',
      scopes: (body.scope ?? '').split(' ').filter(Boolean),
      expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
    };
  }

  private authorizationHeaders(accessToken: string): Record<string, string> {
    return { authorization: `Bearer ${accessToken}` };
  }

  private apiBaseUrl(): string {
    return (this.config.apiBaseUrl ?? 'https://gmail.googleapis.com').replace(
      /\/$/,
      '',
    );
  }

  private assertConfigured(): void {
    if (
      this.config.clientId.trim() === '' ||
      this.config.clientSecret.trim() === '' ||
      this.config.redirectUri.trim() === ''
    ) {
      throw new GoogleApiError(
        'Gmail OAuth is not configured.',
        503,
        'Missing clientId, clientSecret, or redirectUri.',
      );
    }
  }
}
