import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import {
  memberships,
  workspaces,
  workspaceInvitations,
  workspacePreferences,
  workspaceSelections,
} from '../../../../database/schema/workspace.schema';
import { users } from '../../../../database/schema/auth.schema';
import type { DatabaseTransaction } from '../../../../database/transaction';
import type { CursorTuple } from '../../../../common/pagination/cursor';
import {
  WorkspaceRepository,
  type Preferences,
} from '../application/ports/workspace.repository';
// Cursor timestamps use JavaScript milliseconds. Match that precision in both
// comparison and ordering; native PostgreSQL microseconds would repeat anchors.
@Injectable()
export class DrizzleWorkspaceRepository extends WorkspaceRepository {
  async workspace(tx: DatabaseTransaction, id: string, lock = false) {
    const query = tx.select().from(workspaces).where(eq(workspaces.id, id));
    const [row] = lock ? await query.for('update') : await query;
    return row;
  }
  async membership(
    tx: DatabaseTransaction,
    workspaceId: string,
    userId: string,
  ) {
    const [row] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.userId, userId),
        ),
      );
    return row;
  }
  members(
    tx: DatabaseTransaction,
    workspaceId: string,
    limit?: number,
    cursor?: CursorTuple,
  ) {
    const query = tx
      .select({
        id: memberships.id,
        workspaceId: memberships.workspaceId,
        userId: memberships.userId,
        role: memberships.role,
        state: memberships.state,
        createdAt: memberships.createdAt,
        updatedAt: memberships.updatedAt,
        user: {
          id: users.id,
          name: users.fullName,
          email: users.email,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          cursor
            ? or(
                gt(
                  sql<Date>`date_trunc('milliseconds', ${memberships.createdAt})`,
                  cursor.createdAt,
                ),
                and(
                  eq(
                    sql<Date>`date_trunc('milliseconds', ${memberships.createdAt})`,
                    cursor.createdAt,
                  ),
                  gt(memberships.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(
        asc(sql<Date>`date_trunc('milliseconds', ${memberships.createdAt})`),
        asc(memberships.id),
      );
    return limit === undefined ? query : query.limit(limit);
  }
  async countWorkspaces(
    tx: DatabaseTransaction,
    userId: string,
  ): Promise<number> {
    const [row] = await tx
      .select({ total: count() })
      .from(workspaces)
      .innerJoin(
        memberships,
        and(
          eq(memberships.workspaceId, workspaces.id),
          eq(memberships.userId, userId),
          eq(memberships.state, 'ACTIVE'),
        ),
      )
      .where(and(isNull(workspaces.deletedAt), isNull(workspaces.archivedAt)));
    return row?.total ?? 0;
  }
  async countMembers(
    tx: DatabaseTransaction,
    workspaceId: string,
  ): Promise<number> {
    const [row] = await tx
      .select({ total: count() })
      .from(memberships)
      .where(eq(memberships.workspaceId, workspaceId));
    return row?.total ?? 0;
  }
  async countInvitations(
    tx: DatabaseTransaction,
    workspaceId: string,
  ): Promise<number> {
    const [row] = await tx
      .select({ total: count() })
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.workspaceId, workspaceId));
    return row?.total ?? 0;
  }
  async list(
    tx: DatabaseTransaction,
    userId: string,
    limit: number,
    cursor?: CursorTuple,
  ) {
    const rows = await tx
      .select({ workspace: workspaces })
      .from(workspaces)
      .innerJoin(
        memberships,
        and(
          eq(memberships.workspaceId, workspaces.id),
          eq(memberships.userId, userId),
          eq(memberships.state, 'ACTIVE'),
        ),
      )
      .where(
        and(
          isNull(workspaces.deletedAt),
          isNull(workspaces.archivedAt),
          cursor
            ? or(
                gt(
                  sql<Date>`date_trunc('milliseconds', ${workspaces.createdAt})`,
                  cursor.createdAt,
                ),
                and(
                  eq(
                    sql<Date>`date_trunc('milliseconds', ${workspaces.createdAt})`,
                    cursor.createdAt,
                  ),
                  gt(workspaces.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(
        asc(sql<Date>`date_trunc('milliseconds', ${workspaces.createdAt})`),
        asc(workspaces.id),
      )
      .limit(limit);
    return rows.map((row) => row.workspace);
  }
  async create(
    tx: DatabaseTransaction,
    workspace: typeof workspaces.$inferInsert,
    owner: typeof memberships.$inferInsert,
  ) {
    const [row] = await tx.insert(workspaces).values(workspace).returning();
    await tx.insert(memberships).values(owner);
    if (!row) throw new Error('Expected database row.');
    return row;
  }
  async update(
    tx: DatabaseTransaction,
    id: string,
    values: Partial<typeof workspaces.$inferInsert>,
  ) {
    const [row] = await tx
      .update(workspaces)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(workspaces.id, id))
      .returning();
    if (!row) throw new Error('Expected database row.');
    return row;
  }
  async saveMember(
    tx: DatabaseTransaction,
    value: typeof memberships.$inferInsert,
  ) {
    const [row] = await tx
      .insert(memberships)
      .values(value)
      .onConflictDoUpdate({
        target: [memberships.workspaceId, memberships.userId],
        set: { role: value.role, state: value.state, updatedAt: new Date() },
      })
      .returning();
    if (!row) throw new Error('Expected database row.');
    return row;
  }
  invitations(
    tx: DatabaseTransaction,
    workspaceId: string,
    limit?: number,
    cursor?: CursorTuple,
  ) {
    const query = tx
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          cursor
            ? or(
                gt(
                  sql<Date>`date_trunc('milliseconds', ${workspaceInvitations.createdAt})`,
                  cursor.createdAt,
                ),
                and(
                  eq(
                    sql<Date>`date_trunc('milliseconds', ${workspaceInvitations.createdAt})`,
                    cursor.createdAt,
                  ),
                  gt(workspaceInvitations.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(
        asc(
          sql<Date>`date_trunc('milliseconds', ${workspaceInvitations.createdAt})`,
        ),
        asc(workspaceInvitations.id),
      );
    return limit === undefined ? query : query.limit(limit);
  }
  async invitation(tx: DatabaseTransaction, workspaceId: string, id: string) {
    const [row] = await tx
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          eq(workspaceInvitations.id, id),
        ),
      );
    return row;
  }
  async invitationByHash(tx: DatabaseTransaction, hash: string) {
    const [row] = await tx
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.tokenHash, hash));
    return row;
  }
  async expireInvitations(
    tx: DatabaseTransaction,
    workspaceId: string,
    email: string,
    now: Date,
  ) {
    await tx
      .update(workspaceInvitations)
      .set({ revokedAt: now })
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          eq(workspaceInvitations.email, email),
          isNull(workspaceInvitations.acceptedAt),
          isNull(workspaceInvitations.revokedAt),
          lte(workspaceInvitations.expiresAt, now),
        ),
      );
  }
  async saveInvitation(
    tx: DatabaseTransaction,
    invitation: typeof workspaceInvitations.$inferInsert,
  ) {
    const [row] = await tx
      .insert(workspaceInvitations)
      .values(invitation)
      .returning();
    if (!row) throw new Error('Expected database row.');
    return row;
  }
  async updateInvitation(
    tx: DatabaseTransaction,
    id: string,
    values: Partial<typeof workspaceInvitations.$inferInsert>,
  ) {
    const [row] = await tx
      .update(workspaceInvitations)
      .set(values)
      .where(eq(workspaceInvitations.id, id))
      .returning();
    if (!row) throw new Error('Expected database row.');
    return row;
  }
  async user(tx: DatabaseTransaction, id: string) {
    const [row] = await tx
      .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, id));
    return row;
  }
  async preference(tx: DatabaseTransaction, membershipId: string) {
    const [row] = await tx
      .select()
      .from(workspacePreferences)
      .where(eq(workspacePreferences.membershipId, membershipId));
    return row?.preferences;
  }
  async savePreference(
    tx: DatabaseTransaction,
    membershipId: string,
    preferences: Preferences,
  ) {
    await tx
      .insert(workspacePreferences)
      .values({ membershipId, preferences })
      .onConflictDoUpdate({
        target: workspacePreferences.membershipId,
        set: { preferences, updatedAt: new Date() },
      });
  }
  async selection(tx: DatabaseTransaction, userId: string) {
    const [row] = await tx
      .select()
      .from(workspaceSelections)
      .where(eq(workspaceSelections.userId, userId));
    return row?.workspaceId;
  }
  async select(tx: DatabaseTransaction, userId: string, workspaceId: string) {
    await tx
      .insert(workspaceSelections)
      .values({ userId, workspaceId })
      .onConflictDoUpdate({
        target: workspaceSelections.userId,
        set: { workspaceId, updatedAt: new Date() },
      });
  }
}
