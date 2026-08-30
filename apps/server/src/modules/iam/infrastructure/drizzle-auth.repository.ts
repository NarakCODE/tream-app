import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import {
  magicLinkTokens,
  refreshSessions,
  users,
} from '../../../database/schema';
import { ResourceConflictException } from '../../../common/exceptions/resource-conflict.exception';
import type { AuthUser } from '../domain/auth-user';
import type {
  AuthRepository,
  CreateAuthUserInput,
  MagicLinkTokenInput,
  RefreshSessionInput,
  ReplacementRefreshSessionInput,
  UpdateAuthUserInput,
} from '../application/ports/auth-repository.port';

const first = <T>(values: T[]): T | null => values[0] ?? null;

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === '23505';

@Injectable()
export class DrizzleAuthRepository implements AuthRepository {
  constructor(private readonly database: DatabaseService) {}

  async findUserByEmail(email: string): Promise<AuthUser | null> {
    return first(
      await this.database.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1),
    );
  }

  async findUserById(userId: string): Promise<AuthUser | null> {
    return first(
      await this.database.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
    );
  }

  async createUser(input: CreateAuthUserInput): Promise<AuthUser> {
    try {
      const created = first(
        await this.database.db
          .insert(users)
          .values({
            ...input,
            updatedAt: input.createdAt,
          })
          .returning(),
      );
      if (created === null) {
        throw new Error('The user insert returned no row.');
      }
      return created;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ResourceConflictException(
          'An account with this email address already exists.',
          { field: 'email' },
        );
      }
      throw error;
    }
  }

  async updateUser(
    userId: string,
    input: UpdateAuthUserInput,
  ): Promise<AuthUser | null> {
    return first(
      await this.database.db
        .update(users)
        .set(input)
        .where(eq(users.id, userId))
        .returning(),
    );
  }

  async createRefreshSession(input: RefreshSessionInput): Promise<void> {
    await this.database.db.insert(refreshSessions).values(input);
  }

  async rotateRefreshSession(
    tokenHash: string,
    replacement: ReplacementRefreshSessionInput,
    revokedAt: Date,
  ): Promise<AuthUser | null> {
    return this.database.db.transaction(async (transaction) => {
      const session = first(
        await transaction
          .update(refreshSessions)
          .set({ revokedAt })
          .where(
            and(
              eq(refreshSessions.tokenHash, tokenHash),
              isNull(refreshSessions.revokedAt),
              gt(refreshSessions.expiresAt, revokedAt),
            ),
          )
          .returning({ userId: refreshSessions.userId }),
      );
      if (session === null) {
        return null;
      }

      await transaction.insert(refreshSessions).values({
        ...replacement,
        userId: session.userId,
      });
      return first(
        await transaction
          .select()
          .from(users)
          .where(eq(users.id, session.userId))
          .limit(1),
      );
    });
  }

  async revokeRefreshSession(
    tokenHash: string,
    userId: string,
    revokedAt: Date,
  ): Promise<void> {
    await this.database.db
      .update(refreshSessions)
      .set({ revokedAt })
      .where(
        and(
          eq(refreshSessions.tokenHash, tokenHash),
          eq(refreshSessions.userId, userId),
          isNull(refreshSessions.revokedAt),
        ),
      );
  }

  async createMagicLinkToken(input: MagicLinkTokenInput): Promise<void> {
    await this.database.db.transaction(async (transaction) => {
      await transaction
        .update(magicLinkTokens)
        .set({ consumedAt: input.createdAt })
        .where(
          and(
            eq(magicLinkTokens.userId, input.userId),
            isNull(magicLinkTokens.consumedAt),
          ),
        );
      await transaction.insert(magicLinkTokens).values(input);
    });
  }

  async consumeMagicLinkToken(
    tokenHash: string,
    consumedAt: Date,
  ): Promise<AuthUser | null> {
    return this.database.db.transaction(async (transaction) => {
      const token = first(
        await transaction
          .update(magicLinkTokens)
          .set({ consumedAt })
          .where(
            and(
              eq(magicLinkTokens.tokenHash, tokenHash),
              isNull(magicLinkTokens.consumedAt),
              gt(magicLinkTokens.expiresAt, consumedAt),
            ),
          )
          .returning({ userId: magicLinkTokens.userId }),
      );
      if (token === null) {
        return null;
      }
      return first(
        await transaction
          .select()
          .from(users)
          .where(eq(users.id, token.userId))
          .limit(1),
      );
    });
  }
}
