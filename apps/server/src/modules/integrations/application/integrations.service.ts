import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { ulid } from 'ulid';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import type { Integration, PublicIntegration } from '../domain/integration';
import { toPublicIntegration } from '../domain/integration';
import { GoogleApiError } from '../infrastructure/google-api.error';
import { GMAIL_OAUTH, type GmailOAuthPort } from './ports/gmail-oauth.port';
import {
  INTEGRATION_EVENT_PUBLISHER,
  type IntegrationEventPublisher,
} from './ports/integration-event-publisher.port';
import {
  INTEGRATIONS_REPOSITORY,
  SUPPORTED_INTEGRATION_PROVIDERS,
  type IntegrationAccess,
  type IntegrationsRepository,
  type OAuthState,
} from './ports/integrations-repository.port';
import { OAUTH_VAULT, type OAuthVault } from './ports/oauth-vault.port';

export interface OAuthAuthorization {
  authorizationUrl: string;
  expiresAt: string;
}

@Injectable()
export class IntegrationsService {
  constructor(
    @Inject(INTEGRATIONS_REPOSITORY)
    private readonly repository: IntegrationsRepository,
    @Inject(GMAIL_OAUTH) private readonly oauth: GmailOAuthPort,
    @Inject(OAUTH_VAULT) private readonly vault: OAuthVault,
    @Inject(INTEGRATION_EVENT_PUBLISHER)
    private readonly events: IntegrationEventPublisher,
  ) {}

  providers(): readonly string[] {
    return SUPPORTED_INTEGRATION_PROVIDERS;
  }

  async list(workspaceId: string): Promise<PublicIntegration[]> {
    return (await this.repository.list(workspaceId)).map(toPublicIntegration);
  }

  get(access: IntegrationAccess): PublicIntegration {
    return toPublicIntegration(access.integration);
  }

  connect(
    workspaceId: string,
    actorUserId: string,
  ): Promise<OAuthAuthorization> {
    return this.initiateOAuth(workspaceId, actorUserId, `int_${ulid()}`);
  }

  reconnect(
    access: IntegrationAccess,
    actorUserId: string,
  ): Promise<OAuthAuthorization> {
    return this.initiateOAuth(
      access.integration.workspaceId,
      actorUserId,
      access.integration.id,
    );
  }

  async callback(stateValue: string, code: string): Promise<PublicIntegration> {
    const consumedAt = new Date();
    const state = await this.repository.consumeOAuthState(
      this.hashState(stateValue),
      consumedAt,
    );
    if (state === null) {
      throw new AppException(
        AppErrorCode.BadRequest,
        'The OAuth state is invalid, expired, or already used.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const exchanged = await this.oauth.exchangeCode({
        code,
        codeVerifier: this.vault.decryptSecret(
          state.workspaceId,
          state.encryptedCodeVerifier,
        ),
      });
      const profile = await this.oauth.getProfile(exchanged.accessToken);
      const now = new Date();
      const integration: Integration = {
        id: state.integrationId,
        workspaceId: state.workspaceId,
        provider: 'gmail',
        accountEmail: profile.email,
        encryptedTokens: this.vault.encryptTokens(state.workspaceId, exchanged),
        grantedScopes: exchanged.scopes,
        status: 'ACTIVE',
        lastTestedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      const saved = await this.repository.saveIntegration({
        integration,
        reconnectIntegrationId: state.integrationId,
      });
      await this.events.publish({
        type: 'integration.connected',
        workspaceId: saved.workspaceId,
        integrationId: saved.id,
        provider: 'gmail',
        accountEmail: saved.accountEmail,
      });
      return toPublicIntegration(saved);
    } catch (error) {
      await this.publishAuthFailure(state, this.safeFailureReason(error));
      throw this.providerException(error, 'Gmail authorization failed.');
    }
  }

  async test(access: IntegrationAccess): Promise<PublicIntegration> {
    try {
      await this.withAccessToken(access.integration, (accessToken) =>
        this.oauth.getProfile(accessToken),
      );
      const testedAt = new Date();
      const updated = await this.repository.updateStatus(
        access.integration.id,
        'ACTIVE',
        testedAt,
        testedAt,
      );
      return toPublicIntegration(updated ?? access.integration);
    } catch (error) {
      await this.expireAfterAuthFailure(access.integration, error);
      throw this.providerException(error, 'Gmail connection test failed.');
    }
  }

  async disconnect(access: IntegrationAccess): Promise<void> {
    if (access.integration.status === 'REVOKED') return;
    const tokens = this.vault.decryptTokens(
      access.integration.workspaceId,
      access.integration.encryptedTokens,
    );
    await this.oauth.revoke(tokens.refreshToken ?? tokens.accessToken);
    await this.repository.updateStatus(
      access.integration.id,
      'REVOKED',
      new Date(),
    );
  }

  async withAccessToken<T>(
    integration: Integration,
    operation: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    if (integration.status === 'REVOKED') {
      throw new ResourceNotFoundException('Integration', integration.id);
    }
    let tokens = this.vault.decryptTokens(
      integration.workspaceId,
      integration.encryptedTokens,
    );
    if (Date.parse(tokens.expiresAt) <= Date.now() + 60_000) {
      tokens = await this.refreshTokens(integration, tokens.refreshToken);
    }
    try {
      return await operation(tokens.accessToken);
    } catch (error) {
      if (!(error instanceof GoogleApiError) || error.status !== 401)
        throw error;
      tokens = await this.refreshTokens(integration, tokens.refreshToken);
      return operation(tokens.accessToken);
    }
  }

  async findForInternalUse(integrationId: string): Promise<Integration> {
    const integration = await this.repository.findById(integrationId);
    if (integration === null || integration.status === 'REVOKED') {
      throw new ResourceNotFoundException('Integration', integrationId);
    }
    return integration;
  }

  private async initiateOAuth(
    workspaceId: string,
    actorUserId: string,
    integrationId: string,
  ): Promise<OAuthAuthorization> {
    const stateValue = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60_000);
    const result = await this.repository.saveOAuthState({
      actorUserId,
      state: {
        stateHash: this.hashState(stateValue),
        integrationId,
        workspaceId,
        initiatedBy: actorUserId,
        encryptedCodeVerifier: this.vault.encryptSecret(
          workspaceId,
          codeVerifier,
        ),
        expiresAt,
        consumedAt: null,
        createdAt: now,
      },
    });
    if (result.type === 'forbidden') throw this.forbidden();
    return {
      authorizationUrl: this.oauth.createAuthorizationUrl({
        state: stateValue,
        codeChallenge,
      }),
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async refreshTokens(
    integration: Integration,
    refreshToken: string | null,
  ) {
    if (refreshToken === null) {
      await this.repository.updateStatus(integration.id, 'EXPIRED', new Date());
      throw new GoogleApiError(
        'The Gmail connection must be reauthorized.',
        401,
        '',
      );
    }
    try {
      const refreshed = await this.oauth.refresh(refreshToken);
      const merged = {
        ...refreshed,
        refreshToken: refreshed.refreshToken ?? refreshToken,
        scopes:
          refreshed.scopes.length === 0
            ? integration.grantedScopes
            : refreshed.scopes,
      };
      await this.repository.updateTokens({
        integrationId: integration.id,
        encryptedTokens: this.vault.encryptTokens(
          integration.workspaceId,
          merged,
        ),
        grantedScopes: merged.scopes,
        status: 'ACTIVE',
        updatedAt: new Date(),
      });
      return merged;
    } catch (error) {
      await this.expireAfterAuthFailure(integration, error);
      throw error;
    }
  }

  private async expireAfterAuthFailure(
    integration: Integration,
    error: unknown,
  ): Promise<void> {
    await this.repository.updateStatus(integration.id, 'EXPIRED', new Date());
    await this.events.publish({
      type: 'integration.auth_failed',
      workspaceId: integration.workspaceId,
      integrationId: integration.id,
      provider: 'gmail',
      reason: this.safeFailureReason(error),
    });
  }

  private async publishAuthFailure(
    state: OAuthState,
    reason: string,
  ): Promise<void> {
    await this.events.publish({
      type: 'integration.auth_failed',
      workspaceId: state.workspaceId,
      integrationId: state.integrationId,
      provider: 'gmail',
      reason,
    });
  }

  private hashState(state: string): string {
    return createHash('sha256').update(state).digest('hex');
  }

  private safeFailureReason(error: unknown): string {
    if (error instanceof GoogleApiError) {
      return error.status === 401 || error.status === 400
        ? 'Google rejected or expired the OAuth credentials.'
        : 'The Google API was unavailable.';
    }
    return 'The integration authorization could not be completed.';
  }

  private providerException(error: unknown, message: string): AppException {
    const unavailable = error instanceof GoogleApiError && error.status >= 500;
    return new AppException(
      unavailable ? AppErrorCode.ServiceUnavailable : AppErrorCode.BadRequest,
      message,
      unavailable ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_REQUEST,
    );
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to manage integrations in this workspace.',
      HttpStatus.FORBIDDEN,
    );
  }
}
