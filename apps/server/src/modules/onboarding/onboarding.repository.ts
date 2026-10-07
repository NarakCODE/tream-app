import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DatabaseTransaction } from '../../database/transaction';
import { users } from '../../database/schema/auth.schema';
import {
  memberships,
  workspaces,
  workspaceSelections,
} from '../../database/schema/workspace.schema';
import { teams } from '../../database/schema/work-management.schema';

@Injectable()
export class OnboardingRepository {
  async user(tx: DatabaseTransaction, userId: string) {
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    return user;
  }
  async hasWorkspace(tx: DatabaseTransaction, userId: string) {
    const [row] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.state, 'ACTIVE'),
          isNull(workspaces.archivedAt),
          isNull(workspaces.deletedAt),
        ),
      )
      .limit(1);
    return !!row;
  }
  // Existence only: private-team details never cross this boundary.
  async hasTeam(tx: DatabaseTransaction, workspaceId: string) {
    const [row] = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.workspaceId, workspaceId), isNull(teams.retiredAt)))
      .limit(1);
    return !!row;
  }
  async lockSelection(tx: DatabaseTransaction, userId: string) {
    const [row] = await tx
      .select()
      .from(workspaceSelections)
      .where(eq(workspaceSelections.userId, userId))
      .for('update');
    return row?.workspaceId;
  }
  async complete(tx: DatabaseTransaction, membershipId: string) {
    await tx
      .update(memberships)
      .set({
        onboardingCompletedAt: sql`coalesce(${memberships.onboardingCompletedAt}, now())`,
        updatedAt: new Date(),
      })
      .where(eq(memberships.id, membershipId));
  }
}
