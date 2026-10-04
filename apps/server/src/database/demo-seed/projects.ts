import { eq } from 'drizzle-orm';
import {
  projectMembers,
  projectMilestones,
  projects,
  projectStatuses,
  projectTeams,
  projectUpdates,
} from '../schema/work-management.schema';
import type { DemoContext } from './context';

export const demoProjectNames = [
  'Customer Portal Launch',
  'Northstar Mobile Companion',
  'Unified Identity Platform',
  'Accessible Design System',
  'Customer Health Analytics',
  'Release Quality Program',
  'Launch Readiness & Enablement',
  'Privacy and Trust Center',
  'Billing Experience Refresh',
  'Partner API Pilot',
  'Legacy Portal Retirement',
  'Enterprise Customer Migration',
] as const;
export const demoProjectStates = [
  'STARTED',
  'STARTED',
  'COMPLETED',
  'PLANNED',
  'PAUSED',
  'STARTED',
  'PLANNED',
  'STARTED',
  'STARTED',
  'CANCELED',
  'COMPLETED',
  'STARTED',
] as const;
export const demoPriorities = [
  'URGENT',
  'HIGH',
  'MEDIUM',
  'LOW',
  'NO_PRIORITY',
] as const;

export async function seedProjects(ctx: DemoContext): Promise<void> {
  const statuses = await ctx.tx
    .select()
    .from(projectStatuses)
    .where(eq(projectStatuses.workspaceId, ctx.workspaceId));
  const started = statuses.find((s) => s.category === 'STARTED');
  if (!started)
    throw new Error(
      'Demo workspace must have its migration-provided project statuses.',
    );
  for (let p = 0; p < demoProjectNames.length; p++) {
    await ctx.tx.insert(projects).values({
      id: ctx.project(p),
      workspaceId: ctx.workspaceId,
      name: demoProjectNames[p]!,
      summary: `Deliver ${demoProjectNames[p]!.toLowerCase()} for Northstar's autumn customer release.`,
      description:
        'Coordinate product, engineering, design, and customer success. Ship a measurable customer outcome with accessible workflows, documented rollout criteria, and a tested rollback plan.',
      status: 'STARTED',
      statusId: started.id,
      createdById: ctx.member(0),
      leadId: ctx.member(p % 5),
      priority: demoPriorities[p % 5]!,
      startDate: ctx.date(-35),
      targetDate: ctx.date(p === 4 ? -3 : 5 + p * 2),
      createdAt: ctx.date(-45),
      updatedAt: ctx.date(-p / 12),
    });
    await ctx.tx.insert(projectTeams).values(
      Array.from({ length: 8 }, (_, t) => ({
        id: ctx.id(`project-team:${p}:${t}`),
        workspaceId: ctx.workspaceId,
        projectId: ctx.project(p),
        teamId: ctx.team(t),
        createdAt: ctx.date(-35),
      })),
    );
    await ctx.tx.insert(projectMembers).values(
      Array.from({ length: 6 }, (_, m) => ({
        id: ctx.id(`project-member:${p}:${m}`),
        workspaceId: ctx.workspaceId,
        projectId: ctx.project(p),
        membershipId: ctx.member(m),
        createdAt: ctx.date(-35),
        updatedAt: ctx.now,
      })),
    );
    await ctx.tx.insert(projectMilestones).values(
      ['Discovery sign-off', 'Customer pilot', 'General availability'].map(
        (name, i) => ({
          id: ctx.id(`milestone:${p}:${i}`),
          workspaceId: ctx.workspaceId,
          projectId: ctx.project(p),
          name,
          position: i,
          description: [
            'Approve interviews and success metrics.',
            'Validate workflows with six design partners.',
            'Roll out with support coverage and release notes.',
          ][i]!,
          targetDate: ctx
            .date(-15 + i * 15 + p)
            .toISOString()
            .slice(0, 10),
          completedAt: i === 0 ? ctx.date(-14) : null,
          createdAt: ctx.date(-35),
          updatedAt: ctx.now,
        }),
      ),
    );
    await ctx.tx.insert(projectUpdates).values(
      Array.from({ length: 3 }, (_, i) => ({
        id: ctx.id(`project-update:${p}:${i}`),
        workspaceId: ctx.workspaceId,
        projectId: ctx.project(p),
        authorId: ctx.member(i % 3),
        body: [
          'Discovery is complete. Customer interviews confirmed the priority workflows, and engineering has sized the pilot scope.',
          'The pilot is underway. We are resolving accessibility feedback and monitoring activation before widening the rollout.',
          'Release review: support materials are ready. The remaining integration risk has an owner and a mitigation plan for this week.',
        ][i]!,
        health: (['ON_TRACK', 'AT_RISK', 'OFF_TRACK'] as const)[(p + i) % 3]!,
        createdAt: ctx.date(-21 + i * 7),
        updatedAt: ctx.date(-21 + i * 7),
      })),
    );
  }
}
