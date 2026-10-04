import {
  issueStatuses,
  teamMemberships,
  teams,
} from '../schema/work-management.schema';
import type { DemoContext } from './context';

export const demoTeams = [
  [
    'PORT',
    'Customer Portal',
    'Self-service accounts, billing, and customer onboarding.',
  ],
  [
    'MOB',
    'Mobile Experience',
    'Native customer workflows and dependable offline access.',
  ],
  [
    'PLAT',
    'Platform Engineering',
    'Shared APIs, identity, and deployment foundations.',
  ],
  [
    'DES',
    'Product Design',
    'Accessible journeys and a consistent design language.',
  ],
  [
    'DATA',
    'Data & Insights',
    'Trustworthy launch metrics and customer reporting.',
  ],
  [
    'QA',
    'Quality Engineering',
    'Release confidence, automation, and performance testing.',
  ],
  ['GTM', 'Go to Market', 'Launch communications, enablement, and adoption.'],
  [
    'SEC',
    'Security & Trust',
    'Privacy reviews, access policies, and incident readiness.',
  ],
] as const;
export const demoCategories = [
  'BACKLOG',
  'UNSTARTED',
  'STARTED',
  'COMPLETED',
  'CANCELED',
  'DUPLICATE',
] as const;
const statusNames = [
  'Backlog',
  'Ready',
  'In progress',
  'Done',
  'Canceled',
  'Duplicate',
];

export async function seedTeams(ctx: DemoContext): Promise<void> {
  for (let t = 0; t < demoTeams.length; t++) {
    const [key, name, description] = demoTeams[t]!;
    await ctx.tx
      .insert(teams)
      .values({
        id: ctx.team(t),
        workspaceId: ctx.workspaceId,
        key,
        name,
        description,
        visibility: t === 7 ? 'PRIVATE' : 'WORKSPACE',
        timezone: 'America/New_York',
        cyclesEnabled: true,
        nextIssueNumber: 10,
        cycleDurationWeeks: 2,
        createdAt: ctx.date(-60),
        updatedAt: ctx.now,
      })
      .onConflictDoNothing();
    for (let m = 0; m < 6; m++) {
      await ctx.tx
        .insert(teamMemberships)
        .values({
          id: ctx.id(`team-member:${t}:${m}`),
          workspaceId: ctx.workspaceId,
          teamId: ctx.team(t),
          membershipId: ctx.member(m),
          role: m === 0 || m === 1 ? 'ADMIN' : 'MEMBER',
          createdAt: ctx.date(-45),
          updatedAt: ctx.now,
        })
        .onConflictDoNothing();
    }
    await ctx.tx
      .insert(issueStatuses)
      .values(
        demoCategories.map((category, position) => ({
          id: ctx.id(`issue-status:${t}:${category}`),
          teamId: ctx.team(t),
          name: statusNames[position]!,
          category,
          position,
          isDefault: position === 0,
          createdAt: ctx.date(-60),
          updatedAt: ctx.now,
        })),
      )
      .onConflictDoNothing();
  }
}
