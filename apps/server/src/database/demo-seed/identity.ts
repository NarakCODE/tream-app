import { eq } from 'drizzle-orm';
import { hashPassword } from '../../modules/iam/authentication/application/password';
import {
  users,
  memberships,
  workspaces,
  workspaceInvitations,
  workspacePreferences,
  workspaceSelections,
} from '../schema';
import type { DemoContext } from './context';

export const DEMO_SLUG = 'northstar-demo';
export const DEMO_EMAIL = 'demo@yourapp.com';
export const DEMO_PASSWORD = 'Demo@1234';
export const DEMO_MARKER = 'northstar-demo-v1';
const roster = [
  ['Alex Morgan', DEMO_EMAIL, 'OWNER'],
  ['Priya Shah', 'priya@northstar-demo.example', 'ADMIN'],
  ['Mateo Rivera', 'mateo@northstar-demo.example', 'MEMBER'],
  ['Emma Chen', 'emma@northstar-demo.example', 'MEMBER'],
  ['Noah Williams', 'noah@northstar-demo.example', 'MEMBER'],
  ['Sofia Laurent', 'sofia@northstar-demo.example', 'GUEST'],
] as const;

export async function seedIdentity(ctx: DemoContext) {
  const { tx } = ctx;
  for (const [i, person] of roster.entries()) {
    const existing = await tx
      .select()
      .from(users)
      .where(eq(users.email, person[1]));
    if (existing[0] && existing[0].id !== ctx.user(i))
      throw new Error(
        `Reserved demo email already belongs to a non-demo account: ${person[1]}`,
      );
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    await tx
      .insert(users)
      .values({
        id: ctx.user(i),
        fullName: person[0],
        email: person[1],
        passwordHash,
        emailVerifiedAt: ctx.date(-90),
        createdAt: ctx.date(-90),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          fullName: person[0],
          passwordHash,
          emailVerifiedAt: ctx.date(-90),
          disabledAt: null,
          updatedAt: ctx.now,
        },
      });
  }
  await tx
    .insert(workspaces)
    .values({
      id: ctx.workspaceId,
      name: 'Northstar',
      slug: DEMO_SLUG,
      settings: { demoSeed: { marker: DEMO_MARKER, namespace: ctx.namespace } },
      createdAt: ctx.date(-90),
    })
    .onConflictDoNothing();
  for (const [i, person] of roster.entries()) {
    await tx
      .insert(memberships)
      .values({
        id: ctx.member(i),
        workspaceId: ctx.workspaceId,
        userId: ctx.user(i),
        role: person[2],
        state: 'ACTIVE',
        createdAt: ctx.date(-85),
      })
      .onConflictDoUpdate({
        target: memberships.id,
        set: { role: person[2], state: 'ACTIVE', updatedAt: ctx.now },
      });
    await tx
      .insert(workspaceSelections)
      .values({ userId: ctx.user(i), workspaceId: ctx.workspaceId })
      .onConflictDoUpdate({
        target: workspaceSelections.userId,
        set: { workspaceId: ctx.workspaceId, updatedAt: ctx.now },
      });
    await tx
      .insert(workspacePreferences)
      .values({
        membershipId: ctx.member(i),
        preferences: {
          theme: i % 2 ? 'dark' : 'system',
          timezone: 'Asia/Phnom_Penh',
        },
      })
      .onConflictDoNothing();
  }
  // Historical invitations never enqueue external emails.
  for (let i = 0; i < 12; i++) {
    await tx.insert(workspaceInvitations).values({
      id: ctx.id(`invitation:${i}`),
      workspaceId: ctx.workspaceId,
      email: `partner${i + 1}@northstar-demo.example`,
      role: i % 3 === 0 ? 'ADMIN' : i % 3 === 1 ? 'MEMBER' : 'GUEST',
      tokenHash: ctx.id(`invite-token:${i}`).replaceAll('-', '').repeat(2),
      invitedBy: ctx.member(0),
      createdAt: ctx.date(-8),
      expiresAt: ctx.date(i < 4 ? -1 : 7),
      ...(i >= 8 ? { revokedAt: ctx.date(-2) } : {}),
    });
  }
}
