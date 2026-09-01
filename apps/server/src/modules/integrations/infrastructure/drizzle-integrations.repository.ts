import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import {
  integrationOauthStates,
  integrations,
} from '../../../database/schema/integration.schema';
import {
  memberships,
  workspaces,
} from '../../../database/schema/workspace.schema';
import type {
  IntegrationAccess,
  IntegrationsRepository,
  OAuthState,
  SaveIntegrationInput,
  SaveOAuthStateInput,
  SaveOAuthStateResult,
  UpdateTokensInput,
} from '../application/ports/integrations-repository.port';
import type { Integration, IntegrationStatus } from '../domain/integration';
import { canWriteIntegrations } from '../domain/integration-role-policy';

const first = <T>(rows: T[]): T | null => rows[0] ?? null;

@Injectable()
export class DrizzleIntegrationsRepository implements IntegrationsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(workspaceId: string): Promise<Integration[]> {
    return this.database.db
      .select()
      .from(integrations)
      .where(eq(integrations.workspaceId, workspaceId))
      .orderBy(desc(integrations.createdAt), desc(integrations.id));
  }

  async findAccess(
    integrationId: string,
    userId: string,
  ): Promise<IntegrationAccess | null> {
    return first(
      await this.database.db
        .select({ integration: integrations, role: memberships.role })
        .from(integrations)
        .innerJoin(
          workspaces,
          and(
            eq(workspaces.id, integrations.workspaceId),
            isNull(workspaces.deletedAt),
          ),
        )
        .innerJoin(
          memberships,
          and(
            eq(memberships.workspaceId, integrations.workspaceId),
            eq(memberships.userId, userId),
          ),
        )
        .where(eq(integrations.id, integrationId))
        .limit(1),
    );
  }

  async findById(integrationId: string): Promise<Integration | null> {
    return first(
      await this.database.db
        .select()
        .from(integrations)
        .where(eq(integrations.id, integrationId))
        .limit(1),
    );
  }

  async saveOAuthState(
    input: SaveOAuthStateInput,
  ): Promise<SaveOAuthStateResult> {
    return this.database.db.transaction(async (transaction) => {
      const access = first(
        await transaction
          .select({ role: memberships.role })
          .from(workspaces)
          .innerJoin(
            memberships,
            and(
              eq(memberships.workspaceId, workspaces.id),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .where(
            and(
              eq(workspaces.id, input.state.workspaceId),
              isNull(workspaces.deletedAt),
            ),
          )
          .limit(1),
      );
      if (access === null || !canWriteIntegrations(access.role)) {
        return { type: 'forbidden' } as const;
      }
      await transaction.insert(integrationOauthStates).values(input.state);
      return { type: 'created' } as const;
    });
  }

  async consumeOAuthState(
    stateHash: string,
    consumedAt: Date,
  ): Promise<OAuthState | null> {
    return first(
      await this.database.db
        .update(integrationOauthStates)
        .set({ consumedAt })
        .where(
          and(
            eq(integrationOauthStates.stateHash, stateHash),
            isNull(integrationOauthStates.consumedAt),
            gt(integrationOauthStates.expiresAt, consumedAt),
          ),
        )
        .returning(),
    );
  }

  async saveIntegration(input: SaveIntegrationInput): Promise<Integration> {
    if (input.reconnectIntegrationId !== null) {
      const updated = first(
        await this.database.db
          .update(integrations)
          .set({
            accountEmail: input.integration.accountEmail,
            encryptedTokens: input.integration.encryptedTokens,
            grantedScopes: input.integration.grantedScopes,
            status: 'ACTIVE',
            updatedAt: input.integration.updatedAt,
          })
          .where(
            and(
              eq(integrations.id, input.reconnectIntegrationId),
              eq(integrations.workspaceId, input.integration.workspaceId),
              eq(integrations.provider, 'gmail'),
            ),
          )
          .returning(),
      );
      if (updated !== null) return updated;
    }

    const saved = first(
      await this.database.db
        .insert(integrations)
        .values(input.integration)
        .onConflictDoUpdate({
          target: [
            integrations.workspaceId,
            integrations.provider,
            integrations.accountEmail,
          ],
          set: {
            encryptedTokens: input.integration.encryptedTokens,
            grantedScopes: input.integration.grantedScopes,
            status: 'ACTIVE',
            updatedAt: input.integration.updatedAt,
          },
        })
        .returning(),
    );
    if (saved === null) {
      throw new Error('The integration insert returned no row.');
    }
    return saved;
  }

  async updateTokens(input: UpdateTokensInput): Promise<Integration | null> {
    return first(
      await this.database.db
        .update(integrations)
        .set({
          encryptedTokens: input.encryptedTokens,
          grantedScopes: input.grantedScopes,
          status: input.status,
          ...(input.accountEmail === undefined
            ? {}
            : { accountEmail: input.accountEmail }),
          updatedAt: input.updatedAt,
        })
        .where(eq(integrations.id, input.integrationId))
        .returning(),
    );
  }

  async updateStatus(
    integrationId: string,
    status: IntegrationStatus,
    updatedAt: Date,
    lastTestedAt?: Date,
  ): Promise<Integration | null> {
    return first(
      await this.database.db
        .update(integrations)
        .set({
          status,
          updatedAt,
          ...(lastTestedAt === undefined ? {} : { lastTestedAt }),
        })
        .where(eq(integrations.id, integrationId))
        .returning(),
    );
  }
}
