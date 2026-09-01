export const INTEGRATION_PROVIDERS = ['gmail'] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const INTEGRATION_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export interface Integration {
  id: string;
  workspaceId: string;
  provider: IntegrationProvider;
  accountEmail: string;
  encryptedTokens: string;
  grantedScopes: string[];
  status: IntegrationStatus;
  lastTestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PublicIntegration = Omit<Integration, 'encryptedTokens'>;

export const toPublicIntegration = (
  integration: Integration,
): PublicIntegration => ({
  id: integration.id,
  workspaceId: integration.workspaceId,
  provider: integration.provider,
  accountEmail: integration.accountEmail,
  grantedScopes: integration.grantedScopes,
  status: integration.status,
  lastTestedAt: integration.lastTestedAt,
  createdAt: integration.createdAt,
  updatedAt: integration.updatedAt,
});
