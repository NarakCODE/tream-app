import { eq } from 'drizzle-orm';
import {
  cycleRollovers,
  cycles,
  issueIdentifiers,
  issueRelations,
  issues,
  projects,
  projectStatuses,
} from '../schema/work-management.schema';
import type { DemoContext } from './context';
import { demoCategories, demoTeams } from './teams';
import {
  demoPriorities,
  demoProjectNames,
  demoProjectStates,
} from './projects';

const actions = [
  'Map the first-run customer journey',
  'Implement the pilot workflow',
  'Resolve keyboard navigation gaps',
  'Publish integration acceptance criteria',
  'Validate the release with design partners',
  'Retire the superseded prototype',
  'Reconcile the duplicated support request',
  'Document the support handoff',
  'Review customer feedback after launch',
];
const criticalTitles: Record<number, string> = {
  0: 'Approve the customer portal identity contract',
  8: 'Implement verified account provisioning',
  16: 'Connect provisioning to the portal workspace',
  24: 'Complete the end-to-end customer pilot',
  32: 'Release the portal to all launch customers',
  40: 'Prepare support training alongside portal implementation',
  48: 'Polish optional account illustrations after the pilot',
};

export async function seedIssues(ctx: DemoContext): Promise<void> {
  for (let i = 0; i < 72; i++) {
    const t = i % 8;
    const p = i % 12;
    const j = Math.floor(i / 8);
    const category =
      j === 0 || i === 70
        ? 'COMPLETED'
        : j === 1
          ? 'STARTED'
          : j === 8
            ? i === 71
              ? 'DUPLICATE'
              : 'CANCELED'
            : i in criticalTitles
              ? 'STARTED'
              : demoCategories[(j + t) % 6]!;
    const cycleIndex = j < 2 ? 0 : j < 6 ? 1 : j < 8 ? 2 : 3;
    const identifier = `${demoTeams[t]![0]}-${j + 1}`;
    await ctx.tx.insert(issues).values({
      id: ctx.issue(i),
      workspaceId: ctx.workspaceId,
      teamId: ctx.team(t),
      number: j + 1,
      identifier,
      title:
        i === 51
          ? 'Ensure every customer can recover an interrupted mobile onboarding session across unreliable networks without losing accessibility preferences or account progress'
          : (criticalTitles[i] ?? `${actions[j]} — ${demoProjectNames[p]}`),
      description: `Northstar's ${demoTeams[t]![1]} team owns this deliverable for ${demoProjectNames[p]}. Confirm the acceptance criteria with product, validate the customer journey, and attach rollout notes before closing. ${i === 48 ? 'This optional polish has five days of slack and does not gate launch.' : 'Coordinate handoff with the linked dependencies.'}`,
      statusId: ctx.id(`issue-status:${t}:${category}`),
      priority:
        i in criticalTitles && i !== 48
          ? 'URGENT'
          : demoPriorities[(i + j) % 5]!,
      assigneeId: i === 55 ? null : ctx.member(i % 10 < 6 ? 0 : 1 + (i % 5)),
      createdById: ctx.member(i % 3),
      projectId: ctx.project(p),
      milestoneId: ctx.id(`milestone:${p}:${j % 3}`),
      cycleId: ctx.cycle(t, cycleIndex),
      parentId: i === 56 ? ctx.issue(0) : null,
      estimate: [1, 2, 3, 5, 8][j % 5]!,
      sortOrder: i * 100,
      dueDate: ctx.date(i === 8 || i === 17 ? -2 : 2 + j),
      createdAt: ctx.date(-32 + j),
      updatedAt: ctx.date(category === 'COMPLETED' ? -1 - (i % 29) : -i / 100),
      archivedAt: i === 70 ? ctx.date(-1) : null,
      deletedAt: i === 71 ? ctx.date(-1) : null,
    });
    await ctx.tx
      .insert(issueIdentifiers)
      .values({
        id: ctx.id(`issue-identifier:${i}`),
        workspaceId: ctx.workspaceId,
        issueId: ctx.issue(i),
        identifier,
        isCurrent: true,
        createdAt: ctx.date(-32 + j),
        updatedAt: ctx.now,
      })
      .onConflictDoNothing();
  }
  const links = [
    [0, 8, 'BLOCKS'],
    [8, 16, 'BLOCKS'],
    [16, 24, 'BLOCKS'],
    [24, 32, 'BLOCKS'],
    [0, 40, 'BLOCKS'],
    [40, 32, 'BLOCKS'],
    [8, 48, 'RELATED'],
    [6, 54, 'DUPLICATES'],
  ] as const;
  await ctx.tx.insert(issueRelations).values(
    links.map(([source, target, type], i) => ({
      id: ctx.id(`issue-relation:${i}`),
      workspaceId: ctx.workspaceId,
      sourceIssueId: ctx.issue(source),
      targetIssueId: ctx.issue(target),
      type,
      createdById: ctx.member(0),
      createdAt: ctx.date(-12),
      updatedAt: ctx.now,
    })),
  );
  // One unfinished issue per team was carried into the current cycle.
  for (let t = 0; t < 8; t++) {
    await ctx.tx
      .update(issues)
      .set({ cycleId: ctx.cycle(t, 1) })
      .where(eq(issues.id, ctx.issue(8 + t)));
    await ctx.tx.insert(cycleRollovers).values({
      id: ctx.id(`rollover:${t}`),
      workspaceId: ctx.workspaceId,
      teamId: ctx.team(t),
      issueId: ctx.issue(8 + t),
      fromCycleId: ctx.cycle(t, 0),
      toCycleId: ctx.cycle(t, 1),
      rolledAt: ctx.date(-7),
      createdAt: ctx.date(-7),
      updatedAt: ctx.date(-7),
    });
    await ctx.tx
      .update(cycles)
      .set({
        completedAt: ctx.date(-7),
        completionNextCycleId: ctx.cycle(t, 1),
      })
      .where(eq(cycles.id, ctx.cycle(t, 0)));
    await ctx.tx
      .update(cycles)
      .set({ canceledAt: ctx.date(-1) })
      .where(eq(cycles.id, ctx.cycle(t, 3)));
  }
  // Historical work must be attached while a project can accept issues, then finalized.
  const statuses = await ctx.tx
    .select()
    .from(projectStatuses)
    .where(eq(projectStatuses.workspaceId, ctx.workspaceId));
  for (let p = 0; p < 12; p++) {
    const state = demoProjectStates[p]!;
    const status = statuses.find((s) => s.category === state);
    if (!status) throw new Error(`Missing demo project status ${state}.`);
    if (state === 'COMPLETED' || state === 'CANCELED') {
      for (let i = p; i < 72; i += 12) {
        await ctx.tx
          .update(issues)
          .set({
            statusId: ctx.id(`issue-status:${i % 8}:${state}`),
            updatedAt: ctx.date(-1 - (i % 29)),
          })
          .where(eq(issues.id, ctx.issue(i)));
      }
    }
    await ctx.tx
      .update(projects)
      .set({
        status: state,
        statusId: status.id,
        completedAt: state === 'COMPLETED' ? ctx.date(-3 - p) : null,
        archivedAt: p === 10 ? ctx.date(-1) : null,
      })
      .where(eq(projects.id, ctx.project(p)));
  }
}
