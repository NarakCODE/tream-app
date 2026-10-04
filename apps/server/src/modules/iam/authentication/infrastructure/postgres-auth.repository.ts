import { AuthMailOutbox } from './auth-mail-outbox';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../../database/database.service';
import {
  authRateBuckets,
  authTokens,
  refreshSessions,
  users,
} from '../../../../database/schema/auth.schema';
import type {
  AuthRepository,
  AuthUser,
  Session,
  TokenKind,
} from '../application/authentication.types';

@Injectable()
export class PostgresAuthRepository implements AuthRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly mailOutbox: AuthMailOutbox,
  ) {}
  async findByEmail(email: string) {
    return (
      await this.database.db.select().from(users).where(eq(users.email, email))
    )[0];
  }
  async findUser(id: string) {
    return (
      await this.database.db.select().from(users).where(eq(users.id, id))
    )[0];
  }
  async createUser(
    user: AuthUser,
    verification: {
      hash: string;
      expiresAt: Date;
      message: { to: string; subject: string; text: string };
    },
  ) {
    await this.database.db.transaction(async (tx) => {
      await tx.insert(users).values(user);
      await tx.insert(authTokens).values({
        id: randomUUID(),
        userId: user.id,
        kind: 'verify-email',
        tokenHash: verification.hash,
        expiresAt: verification.expiresAt,
      });
      await this.mailOutbox.enqueue(tx, verification.message);
    });
  }
  async updateProfile(id: string, fullName: string) {
    const [user] = await this.database.db
      .update(users)
      .set({ fullName, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (!user) throw new Error('User no longer exists');
    return user;
  }
  async createSession(session: Session, expectedPasswordHash: string | null) {
    await this.database.db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, session.userId))
        .for('update');
      if (
        !user ||
        user.disabledAt ||
        !user.emailVerifiedAt ||
        user.passwordHash !== expectedPasswordHash
      )
        throw new UnauthorizedException('Credentials changed');
      await tx.insert(refreshSessions).values(session);
    });
  }
  async findSession(id: string) {
    return (
      await this.database.db
        .select()
        .from(refreshSessions)
        .where(eq(refreshSessions.id, id))
    )[0];
  }
  async rotate(
    hash: string,
    next: Session,
  ): Promise<'ok' | 'invalid' | 'reused'> {
    return this.database.db.transaction(async (tx) => {
      const [candidate] = await tx
        .select()
        .from(refreshSessions)
        .where(eq(refreshSessions.tokenHash, hash));
      if (!candidate) return 'invalid';
      // User lock serializes every refresh/reset/logout for this account and prevents a replay racing insertion.
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, candidate.userId))
        .for('update');
      const [current] = await tx
        .select()
        .from(refreshSessions)
        .where(eq(refreshSessions.id, candidate.id));
      if (!current) return 'invalid';
      if (current.revokedAt) {
        await tx
          .update(refreshSessions)
          .set({ revokedAt: new Date() })
          .where(eq(refreshSessions.familyId, current.familyId));
        return 'reused';
      }
      if (
        !user ||
        user.disabledAt ||
        !user.emailVerifiedAt ||
        current.expiresAt <= new Date()
      )
        return 'invalid';
      await tx
        .update(refreshSessions)
        .set({ revokedAt: new Date(), lastUsedAt: new Date() })
        .where(eq(refreshSessions.id, current.id));
      await tx.insert(refreshSessions).values({
        ...next,
        userId: current.userId,
        familyId: current.familyId,
      });
      return 'ok';
    });
  }
  async revoke(userId: string, sessionId?: string) {
    await this.database.db.transaction(async (tx) => {
      await tx.select().from(users).where(eq(users.id, userId)).for('update');
      await tx
        .update(refreshSessions)
        .set({ revokedAt: new Date() })
        .where(
          sessionId
            ? and(
                eq(refreshSessions.userId, userId),
                eq(refreshSessions.id, sessionId),
              )
            : eq(refreshSessions.userId, userId),
        );
    });
  }
  async sessions(userId: string) {
    return this.database.db
      .select()
      .from(refreshSessions)
      .where(
        and(
          eq(refreshSessions.userId, userId),
          isNull(refreshSessions.revokedAt),
          gt(refreshSessions.expiresAt, new Date()),
        ),
      );
  }
  async issueToken(
    userId: string,
    kind: TokenKind,
    hash: string,
    expiresAt: Date,
    message?: { to: string; subject: string; text: string },
  ) {
    await this.database.db.transaction(async (tx) => {
      await tx
        .insert(authTokens)
        .values({ id: randomUUID(), userId, kind, tokenHash: hash, expiresAt });
      if (message) await this.mailOutbox.enqueue(tx, message);
    });
  }
  async consumeToken(
    hash: string,
    kind: TokenKind,
    passwordHash?: string,
    session?: Session,
  ) {
    return this.database.db.transaction(async (tx) => {
      const [candidate] = await tx
        .select()
        .from(authTokens)
        .where(and(eq(authTokens.tokenHash, hash), eq(authTokens.kind, kind)));
      if (!candidate) return undefined;
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, candidate.userId))
        .for('update');
      const [token] = await tx
        .update(authTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(authTokens.id, candidate.id),
            isNull(authTokens.consumedAt),
            gt(authTokens.expiresAt, new Date()),
          ),
        )
        .returning();
      if (!token || !user || user.disabledAt) return undefined;
      if (kind === 'password-reset') {
        await tx
          .update(users)
          .set({ passwordHash, updatedAt: new Date() })
          .where(eq(users.id, user.id));
        await tx
          .update(refreshSessions)
          .set({ revokedAt: new Date() })
          .where(eq(refreshSessions.userId, user.id));
        await tx
          .update(authTokens)
          .set({ consumedAt: new Date() })
          .where(
            and(eq(authTokens.userId, user.id), isNull(authTokens.consumedAt)),
          );
      } else if (kind === 'verify-email' || kind === 'magic-link') {
        await tx
          .update(users)
          .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
          .where(eq(users.id, user.id));
        user.emailVerifiedAt = new Date();
      }
      if (kind === 'magic-link' && session)
        await tx
          .insert(refreshSessions)
          .values({ ...session, userId: user.id });
      return user;
    });
  }
  async throttle(key: string, limit: number) {
    const start = new Date(Math.floor(Date.now() / 60000) * 60000);
    const [bucket] = await this.database.db
      .insert(authRateBuckets)
      .values({ key, windowStart: start, attempts: 1 })
      .onConflictDoUpdate({
        target: authRateBuckets.key,
        set: {
          windowStart: start,
          attempts: sql`CASE WHEN ${authRateBuckets.windowStart} = ${start} THEN ${authRateBuckets.attempts} + 1 ELSE 1 END`,
        },
      })
      .returning();
    return Boolean(bucket && bucket.attempts <= limit);
  }
}
