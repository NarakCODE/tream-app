import type { WorkspaceRole } from '../../../iam/domain/workspace-membership';
import type {
  Integration,
  IntegrationProvider,
  IntegrationStatus,
} from '../../domain/integration';

export const INTEGRATIONS_REPOSITORY = Symbol('INTEGRATIONS_REPOSITORY');

export interface IntegrationAccess {
  integration: Integration;
  role: WorkspaceRole;
}

export interface OAuthState {
  stateHash: string;
  integrationId: string;
  workspaceId: string;
  initiatedBy: string;
  encryptedCodeVerifier: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface SaveOAuthStateInput {
  state: OAuthState;
  actorUserId: string;
}

export type SaveOAuthStateResult = { type: 'created' } | { type: 'forbidden' };

export interface SaveIntegrationInput {
  integration: Integration;
  reconnectIntegrationId: string | null;
}

export interface UpdateTokensInput {
  integrationId: string;
  encryptedTokens: string;
  grantedScopes: string[];
  status: IntegrationStatus;
  accountEmail?: string;
  updatedAt: Date;
}

export interface IntegrationsRepository {
  list(workspaceId: string): Promise<Integration[]>;
  findAccess(
    integrationId: string,
    userId: string,
  ): Promise<IntegrationAccess | null>;
  findById(integrationId: string): Promise<Integration | null>;
  saveOAuthState(input: SaveOAuthStateInput): Promise<SaveOAuthStateResult>;
  consumeOAuthState(
    stateHash: string,
    consumedAt: Date,
  ): Promise<OAuthState | null>;
  saveIntegration(input: SaveIntegrationInput): Promise<Integration>;
  updateTokens(input: UpdateTokensInput): Promise<Integration | null>;
  updateStatus(
    integrationId: string,
    status: IntegrationStatus,
    updatedAt: Date,
    lastTestedAt?: Date,
  ): Promise<Integration | null>;
}

export const SUPPORTED_INTEGRATION_PROVIDERS: readonly IntegrationProvider[] = [
  'gmail',
];
