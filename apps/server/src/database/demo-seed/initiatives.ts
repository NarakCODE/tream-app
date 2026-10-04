import { eq } from 'drizzle-orm';
import {
  initiatives,
  initiativeProjects,
  initiativeSubscribers,
  initiativeUpdates,
} from '../schema';
import type { DemoContext } from './context';

const names = [
  'Customer portal launch',
  'Mobile companion experience',
  'Reliable payments and billing',
  'Customer success enablement',
  'Platform resilience',
  'Self-service onboarding',
  'Legacy reporting retirement',
  'Partner marketplace discovery',
];
const statuses = [
  'ACTIVE',
  'ACTIVE',
  'PLANNED',
  'COMPLETED',
  'ACTIVE',
  'PLANNED',
  'CANCELED',
  'PLANNED',
] as const;
const health = ['ON_TRACK', 'AT_RISK', 'OFF_TRACK'] as const;

export async function seedInitiatives(ctx: DemoContext) {
  for (let i = 0; i < names.length; i++) {
    const initiativeId = ctx.id(`initiative:${i}`);
    await ctx.tx.insert(initiatives).values({
      id: initiativeId,
      workspaceId: ctx.workspaceId,
      name: names[i]!,
      description: `Northstar's ${names[i]!.toLowerCase()} program connects product delivery, customer feedback, and operational readiness. Success means customers complete their first useful workflow without assistance.`,
      status: 'PLANNED',
      ownerId: i === 7 ? null : ctx.member(i % 6),
      createdById: ctx.member(0),
      position: i,
      targetDate: ctx
        .date(i === 3 ? -4 : i === 4 ? -2 : 14 + i * 7)
        .toISOString()
        .slice(0, 10),
      createdAt: ctx.date(-35 + i),
      updatedAt: ctx.date(-i / 3),
    });
    await ctx.tx.insert(initiativeProjects).values(
      [0, 1].map((position) => ({
        id: ctx.id(`initiative-project:${i}:${position}`),
        workspaceId: ctx.workspaceId,
        initiativeId,
        projectId: ctx.project((i * 2 + position) % 10),
        position,
        createdAt: ctx.date(-28),
        updatedAt: ctx.date(-2),
      })),
    );
    await ctx.tx.insert(initiativeSubscribers).values(
      [0, 1 + (i % 5)].map((member) => ({
        id: ctx.id(`initiative-subscriber:${i}:${member}`),
        workspaceId: ctx.workspaceId,
        initiativeId,
        membershipId: ctx.member(member),
        createdAt: ctx.date(-21),
        updatedAt: ctx.date(-21),
      })),
    );
    await ctx.tx.insert(initiativeUpdates).values(
      [0, 1, 2].map((n) => ({
        id: ctx.id(`initiative-update:${i}:${n}`),
        workspaceId: ctx.workspaceId,
        initiativeId,
        authorId: ctx.member(i % 6),
        health: health[(i + n) % 3]!,
        body: [
          'Discovery is complete. Customer interviews confirmed that clear ownership and visible delivery dates are the highest-value improvements. Design and engineering agreed the launch acceptance criteria.',
          'The first end-to-end walkthrough is ready. Payment sandbox approval remains the main dependency; the team is delivering the documentation and accessibility work in parallel.',
          'This week we closed the usability feedback loop and reviewed launch readiness with support. The next checkpoint includes mobile network recovery and a production rehearsal.',
        ][n]!,
        createdAt: ctx.date(-18 + n * 7),
        updatedAt: ctx.date(-18 + n * 7),
        deletedAt: i === 7 && n === 0 ? ctx.date(-10) : null,
      })),
    );
    // Link resources while usable, then apply the historical lifecycle.
    await ctx.tx
      .update(initiatives)
      .set({
        status: statuses[i]!,
        archivedAt: i === 6 ? ctx.date(-3) : null,
        updatedAt: ctx.date(-i / 3),
      })
      .where(eq(initiatives.id, initiativeId));
  }
}
